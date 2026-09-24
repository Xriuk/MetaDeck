import json
import os
import decky
import pycdlib
import subprocess
import xmltodict
import urllib.request
import zipfile
import sqlite3
import ssl
import struct
import mmap
import re
from pathlib import Path
from typing import Dict
from helpers import get_ssl_context

SFO_MAGIC = b"\x00\x50\x53\x46" # PSF

GDFX_MAGIC = b"MICROSOFT*XBOX*MEDIA"
SECTOR_SIZE = 2048
BASE_SECTOR = 0x20

class Plugin:
	egs_nsl: Dict[str, Dict[str, any]] | None = None
	gog_nsl: Dict[int, Dict[str, any]] | None = None

	egs_her: Dict[str, Dict[str, any]] | None = None
	gog_her: Dict[int, Dict[str, any]] | None = None

	gametdb = {} # url: { id: { game } }

	async def read_config(self) -> dict:
		with open(os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json"), "r") as f:
			try:
				return json.load(f)
			except:
				return {}

	async def write_config(self, data: dict) -> None:
		with open(os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json"), "w") as f:
			json.dump(data, f, indent="\t")

	async def read_cache(self) -> dict:
		with open(os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "cache.json"), "r") as f:
			try:
				return json.load(f)
			except:
				return {}

	async def write_cache(self, data: dict) -> None:
		with open(os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "cache.json"), "w") as f:
			json.dump(data, f, indent="\t")

	async def read_file(self, path: str) -> str:
		with open(path, "r") as f:
			return f.read()

	async def file_size(self, path: str) -> int:
		if os.path.exists(path):
			return os.path.getsize(path)
		else:
			return 0

	async def file_date(self, path: str) -> int:
		if os.path.exists(path):
			return int(os.path.getctime(path))
		else:
			return 0

	async def directory_size(self, path: str) -> int:
		total_size = 0
		if os.path.exists(path):
			for dirpath, dirnames, filenames in os.walk(path):
				for f in filenames:
					fp = os.path.join(dirpath, f)
					# Skip if it is symbolic link
					if not os.path.islink(fp):
						total_size += os.path.getsize(fp)
		return total_size

	async def nsl_egs_data(self, id: str) -> dict | None:
		if Plugin.egs_nsl is not None and id in Plugin.egs_nsl:
			return Plugin.egs_nsl[id]

	async def nsl_gog_data(self, id: int) -> dict | None:
		if Plugin.gog_nsl is not None and id in Plugin.gog_nsl:
			return Plugin.gog_nsl[id]

	async def heroic_egs_data(self, id: str) -> dict | None:
		if Plugin.egs_her is not None and id in Plugin.egs_her:
			return Plugin.egs_her[id]

	async def heroic_gog_data(self, id: int) -> dict | None:
		if Plugin.gog_her is not None and id in Plugin.gog_her:
			return Plugin.gog_her[id]

	async def rpcs3_get_titleid(self, rom_path: str) -> str | None:
		try:
			path = rom_path + "/PARAM.SFO"
			if not os.path.isfile(path):
				return None

			with open(path, 'rb') as file:
				sfo_bytes = file.read()
				if sfo_bytes[0:4] != SFO_MAGIC:
					return None

				key_table_start, data_table_start, tables_entries = struct.unpack_from("<III", sfo_bytes, 8)

				# Loop through keys to find TITLE_ID
				title_id_index = -1
				index = 0
				start = key_table_start
				while title_id_index == -1 and index < tables_entries:
					end = start
					while end < len(sfo_bytes) and sfo_bytes[end] != b'\x00':
						end += 1
					key = sfo_bytes[start:end].decode('utf-8')
					if key == "TITLE_ID":
						title_id_index = index
					index += 1
					start = end + 1

				if title_id_index == -1:
					return None


				# Retrieve the data offset inside index
				title_id_index_table_offset = 20 + (title_id_index * 16)
				_, data_fmt, _, _, data_offset = struct.unpack_from("<HHIII", sfo_bytes, 8)
				if data_fmt != b'\x04\x02': # Assert for utf-8
					return None

				# Find the entry inside data to retrieve the value
				title_id_data_table_offset = data_table_start + data_offset
				end = title_id_data_table_offset
				while end < len(sfo_bytes) and sfo_bytes[end] != b'\x00':
					end += 1
				return sfo_bytes[start:end].decode('utf-8')

		except e:
			raise Exception(traceback.format_exc())

	# Inspired by https://github.com/valters-tomsons/PS2-Game-Title-Finder/tree/master
	# Retrieves .iso and .bin
	async def pcsx2_get_titleid(self, rom_path: str) -> str | None:
		if not os.path.isfile(rom_path):
			return None

		if rom_path.endswith(".iso"):
			ps2_regions = [
				'ES',
				'US',
				'PS',
				'PM'
			]
			ps2_licenses = [
				'SL',
				'SC'
			]
			with open(rom_path, 'rb') as file:
				iso = pycdlib.PyCdlib()
				iso.open_fp(file)
				for child in iso.list_children(iso_path='/'):
					if child is None:
						continue
					if child.is_file():
						name = child.file_identifier().decode('utf-8')
						for lic in ps2_licenses:
							for reg in ps2_regions:
								if name.startswith(lic + reg):
									return name.split(";")[0].replace('_', '').replace('.', '')
		elif rom_path.endswith(".bin"):
			with open(rom_path, 'r+') as file:
				mm = mmap.mmap(file.fileno(), 0, prot=mmap.PROT_READ)
				match = re.search(b"BOOT2 = cdrom0:", mm)
				return mm[match.end()+1:match.end()+12].decode('ascii').replace('_', '').replace('.', '')
		
		return None

	async def dolphin_get_id6(self, rom_path: str) -> str | None:
		if not os.path.isfile(rom_path):
			return None

		cmd = [
			os.path.join(decky.DECKY_PLUGIN_DIR, "py_modules", "bin", "wit"),
			"id6",
			rom_path
		]
		result = subprocess.run(
			cmd,
			capture_output=True,
			text=True,
			check=True
		)

		return result.stdout.strip()

	# https://github.com/Xriuk/Emuchievements/blob/f35826e78c095c843597a228859d2a1e5fa2dbc1/src/py/main.py#L453-L552
	async def xenia_get_defaultxex(self, iso_path: str) -> bytes:
		with open(iso_path, "rb") as f:
			# https://github.com/xenia-manager/xenia-manager/blob/7704851bec096371e18d1394ed98f166469193db/source/XeniaManager.Core/Models/Files/Iso/IsoSectorReader.cs#L29
			header_offset = None
			base_sector = None
			root_sector = None
			root_size = None
			sectors = [
				BASE_SECTOR,	# XDKI
				0x30620, 		# XGD1
				0x4120,			# XGD3
				0x1FB40,		# XGD2
			]
			for sector in sectors:
				try:
					header_offset = sector * SECTOR_SIZE

					# Read root directory sector and size from GDFX header
					f.seek(header_offset)
					magic, root_sector, root_size = struct.unpack("<20sII", f.read(28))
					if magic == GDFX_MAGIC:
						base_sector = sector - BASE_SECTOR
						break

					f.seek(header_offset + SECTOR_SIZE - 20)
					tailMagic = struct.unpack("<20s", f.read(20))
					if tailMagic == GDFX_MAGIC:
						base_sector = sector - BASE_SECTOR
						break

					header_offset = None

				except:
					continue
			if header_offset is None:
				raise ValueError("Not a valid Xbox 360 GDFX ISO image.")

			# Parse directory entries looking for default.xex
			f.seek((base_sector + root_sector) * SECTOR_SIZE)
			dir_data = f.read(root_size)
			
			pos = 0
			while pos < len(dir_data):
				# Read entry header
				if pos + 14 > len(dir_data):
					break

				_, _, sector, size, _, name_len = struct.unpack("<HHIIBB", dir_data[pos:pos+14])
				if name_len == 0:
					break
					
				name = dir_data[pos+14 : pos+14+name_len].decode("ascii", errors="ignore")
				
				if name.lower() == "default.xex":
					f.seek((base_sector + sector) * SECTOR_SIZE)
					return f.read(size)
				
				# Entry size padded to 4-byte boundary
				entry_size = (14 + name_len + 3) & ~3
				pos += entry_size
		
		return None

	# headers_predicate receives (xex_bytes, key, value) and if returns not None it will be the returned result
	async def xenia_parse_xex(self, xex_bytes: bytes, headers_predicate):
		if len(xex_bytes) < 24 or xex_bytes[:4] != b"XEX2":
			raise ValueError("Not a valid XEX2 file.")

		# Read optional header count (Big-Endian)
		opt_header_count = struct.unpack(">I", xex_bytes[20:24])[0]
		
		pos = 24
		for _ in range(opt_header_count):
			if pos + 8 > len(xex_bytes):
				break
				
			key, value = struct.unpack(">II", xex_bytes[pos:pos+8])
			pos += 8

			result = headers_predicate(xex_bytes, key, value)
			if not result is None:
				return result
			
		return None
	
	async def xenia_get_titleid(self, iso_path: str) -> str:
		def titleid_filter(xex_bytes, key, value):
			# 0x00040006 = Execution ID, 06 x 4 = 24 bytes
			if key == 0x00040006:
				# Value stores the absolute offset to the execution info block
				# Title ID is located 12 bytes into Execution Info (4 bytes long)
				title_id_bytes = xex_bytes[value + 12 : value + 16]
				return title_id_bytes.hex().upper()
			else:
				return None

		xex_bytes = await Plugin.xenia_get_defaultxex(self, iso_path)
		if xex_bytes is None:
			return None
		return await Plugin.xenia_parse_xex(self, xex_bytes, titleid_filter)

	async def gametdb_get_db(self, url: str) -> None:
		if not url.startswith('https://www.gametdb.com/') or not url.endswith('.zip'):
			return

		result = {}

		filename = url.split('/')[-1] # aaatdb.zip
		ssl_backup = ssl._create_default_https_context
		ssl._create_default_https_context = get_ssl_context
		temp_filename = urllib.request.urlretrieve(url)[0]
		ssl._create_default_https_context = ssl_backup
		with zipfile.ZipFile(temp_filename, 'r') as zip_ref:
			xml_bytes = zip_ref.read(filename.replace('.zip', '.xml'))
			datafile = xmltodict.parse(xml_bytes, encoding='utf-8', force_list=['locale', 'control'])['datafile']
			for game in datafile['game']:
				if not 'id' in game:
					continue

				# Ignore "empty" entries
				if not 'developer' in game and not 'publisher' in game and not ('date' in game and '@year' in game['date'] and not (game['date']['@year'] is None) and game['date']['@year'] != "" and '@month' in game['date'] and not (game['date']['@month'] is None) and game['date']['@month'] != "" and '@day' in game['date'] and not (game['date']['@day'] is None) and game['date']['@day'] != "") and not 'locale' in game:
					continue

				locales = {}
				if 'locale' in game:
					for locale in game['locale']:
						if not '@lang' in locale:
							continue

						locales[locale['@lang']] = {
							'title': locale['title'].strip() if 'title' in locale and not (locale['title'] is None) and locale['title'] != "" else None,
							'synopsis': locale['synopsis'].strip() if 'synopsis' in locale and not (locale['synopsis'] is None) and locale['synopsis'] != "" else None
						}
					
				controls = []
				if 'input' in game and 'control' in game['input']:
					for control in game['input']['control']:
						if '@type' in control:
							controls.append({
								'type': control['@type'].strip(),
								'required': control['@required'].strip() == 'true' if '@required' in control else None
							})

				result[game['id'].strip()] = {
					'id': game['id'].strip(),
					'name': game['@name'].strip(),
					'developer': game['developer'] if 'developer' in game else None,
					'publisher': game['publisher'] if 'publisher' in game else None,
					'date': game['date']['@year'].strip() + "-" + game['date']['@month'].strip().rjust(2, '0') + "-" + game['date']['@day'].strip().rjust(2, '0') if 'date' in game and '@year' in game['date'] and not (game['date']['@year'] is None) and game['date']['@year'] != "" and '@month' in game['date'] and not (game['date']['@month'] is None) and game['date']['@month'] != "" and '@day' in game['date'] and not (game['date']['@day'] is None) and game['date']['@day'] != "" else None,
					'locales': locales if len(locales) > 0 else None,
					'wi-fi-players': int(game['wi-fi']['@players']) if 'wi-fi' in game and '@players' in game['wi-fi'] else None,
					'local-players': int(game['input']['@players']) if 'input' in game and '@players' in game['input'] else None,
					'controls': controls if len(controls) > 0 else None
				}

		Plugin.gametdb[url] = result

	async def gametdb_get_entry(self, url: str, id: str) -> str | None:
		if not url in Plugin.gametdb or not id in Plugin.gametdb[url]:
			return None
		else:
			return json.dumps(Plugin.gametdb[url][id])


	def util_remove_c_drive_from_path(path):
		if path.startswith("C:/") or path.startswith("C:\\"):
			return path[3:]

	async def _main(self) -> None:
		decky.logger.info("Starting MetaDeck")
		
		# NSL
		nsl_prefix: Path | None = None

		if (Path(decky.DECKY_USER_HOME) / ".local" / "share" / "Steam" / "steamapps" / "compatdata" / "NonSteamLaunchers").exists():
			nsl_prefix = Path(decky.DECKY_USER_HOME) / ".local" / "share" / "Steam" / "steamapps" / "compatdata" / "NonSteamLaunchers" / "pfx" / "drive_c"
		elif (Path(decky.DECKY_USER_HOME) / ".local" / "share" / "Steam" / "steamapps" / "compatdata" / "EpicGamesLauncher").exists():
			nsl_prefix = Path(decky.DECKY_USER_HOME) / ".local" / "share" / "Steam" / "steamapps" / "compatdata" / "EpicGamesLauncher" / "pfx" / "drive_c"

		if nsl_prefix is not None:
			egs_data = nsl_prefix / "ProgramData" / "Epic" / "EpicGamesLauncher" / "Data" / "Manifests"
			gog_db = nsl_prefix / "ProgramData" / "GOG.com" / "Galaxy" / "storage" / "galaxy-2.0.db"
			if egs_data.exists():
				Plugin.egs_nsl = {}
				for item in os.listdir(egs_data):
					if item.endswith(".item"):
						with open(egs_data / item) as f:
							item_data: dict = json.load(f)
						app_name: str = item_data["AppName"]
						Plugin.egs_nsl[app_name] = {}
						namespace: str = item_data["CatalogNamespace"]
						install_path: str = (nsl_prefix / Path(
							Plugin.util_remove_c_drive_from_path(item_data["InstallLocation"]).replace("\\", "/"))).as_posix()
						install_size: int = item_data["InstallSize"]
						install_date: int = await Plugin.file_date(self, install_path)
						Plugin.egs_nsl[app_name]["namespace"] = namespace
						Plugin.egs_nsl[app_name]["install_size"] = install_size
						Plugin.egs_nsl[app_name]["install_date"] = install_date
						Plugin.egs_nsl[app_name]["install_path"] = install_path

			if gog_db.exists():
				Plugin.gog_nsl = {}
				connection = sqlite3.connect(gog_db)
				cursor = connection.cursor()
				cursor.execute("SELECT productId, installationPath FROM InstalledBaseProducts")
				entries = cursor.fetchall()
				connection.commit()
				connection.close()
				id: int
				path: str
				for id, path in entries:
					Plugin.gog_nsl[id] = {}
					install_path = (nsl_prefix / Path(Plugin.util_remove_c_drive_from_path(path).replace("\\", "/"))).as_posix()
					install_size = await Plugin.directory_size(self, install_path)
					install_date = await Plugin.file_date(self, install_path)
					Plugin.gog_nsl[id]["install_size"] = install_size
					Plugin.gog_nsl[id]["install_data"] = install_date
					Plugin.gog_nsl[id]["install_path"] = install_path

		# Heroic
		legendary: Path | None = None
		gog: Path | None = None

		legendary_native = Path(decky.DECKY_USER_HOME) / ".config" / "heroic" / "legendaryConfig" / "legendary"
		legendary_flatpak = Path(decky.DECKY_USER_HOME) / ".var" / "app" / "com.heroicgameslauncher.hgl" / "config" / "heroic" / "legendaryConfig" / "legendary"
		gog_native = Path(decky.DECKY_USER_HOME) / ".config" / "heroic" / "gog_store"
		gog_flatpak = Path(decky.DECKY_USER_HOME) / ".var" / "app" / "com.heroicgameslauncher.hgl" / "config" / "heroic" / "gog_store"

		if legendary_native.exists():
			legendary = legendary_native
		elif legendary_flatpak.exists():
			legendary = legendary_flatpak

		if gog_native.exists():
			gog = gog_native
		elif gog_flatpak.exists():
			gog = gog_flatpak

		if legendary is not None:
			legendary_installed = legendary / "installed.json"
			legendary_metadata = legendary / "metadata"
			with open(legendary_installed) as f:
				legendary_data: dict = json.load(f)
			Plugin.egs_her = {}
			key: str
			value: dict
			for key, value in legendary_data.items():
				if os.path.exists(legendary_metadata / f"{key}.json"):
					with open(legendary_metadata / f"{key}.json") as f:
						metadata: dict = json.load(f)["metadata"]
					Plugin.egs_her[key] = {}
					namespace: str = metadata["namespace"]
					install_path: str = value["install_path"]
					install_size: int = value["install_size"]
					install_date: int = await Plugin.file_date(self, install_path)
					Plugin.egs_her[key]["namespace"] = namespace
					Plugin.egs_her[key]["install_size"] = install_size
					Plugin.egs_her[key]["install_date"] = install_date
					Plugin.egs_her[key]["install_path"] = install_path

		if gog is not None:
			gog_installed = gog / "installed.json"
			with open(gog_installed) as f:
				gog_data = json.load(f)["installed"]
			Plugin.gog_her = {}
			value: dict
			for value in gog_data:
				id: int = int(value["appName"])
				Plugin.gog_her[id] = {}
				install_path = value["install_path"]
				install_size = await Plugin.directory_size(self, install_path)
				install_date = await Plugin.file_date(self, install_path)
				Plugin.gog_her[id]["install_size"] = install_size
				Plugin.gog_her[id]["install_date"] = install_date
				Plugin.gog_her[id]["install_path"] = install_path

	async def _unload(self) -> None:
		"""
		Unload function
		"""
		decky.logger.info("Stopping MetaDeck")

	# await Plugin.commit(self)
	async def _migration(self):
		decky.migrate_settings(
			os.path.join(decky.DECKY_HOME, "settings", "metadeck.json"))
		if os.path.exists(os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "metadeck.json")):
			os.rename(os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "metadeck.json"),
					os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json"))