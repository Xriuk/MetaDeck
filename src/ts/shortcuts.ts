import {CustomStoreCategory, StoreCategory} from "./Interfaces";
import {call} from "@decky/api";
import type { SteamAppDetails } from "./SteamTypes";

export const romRegex = /(\/([^\/"])+)+(?!\.AppImage)(\.zip|\.7z|\.iso|\.bin|\.chd|\.cue|\.img|\.a26|\.lnx|\.ngp|\.ngc|\.3dsx|\.3ds|\.app|\.axf|\.cci|\.cxi|\.elf|\.n64|\.ndd|\.u1|\.v64|\.z64|\.nds|\.dmg|\.gbc|\.gba|\.gb|\.ciso|\.dol|\.gcm|\.gcz|\.nkit\.iso|\.rvz|\.wad|\.wia|\.wbfs|\.nes|\.fds|\.unif|\.unf|\.json|\.kp|\.nca|\.nro|\.nso|\.nsp|\.xci|\.rpx|\.wud|\.wux|\.wua|\.32x|\.cdi|\.gdi|\.m3u|\.gg|\.gen|\.md|\.smd|\.sms|\.ecm|\.mds|\.pbp|\.dump|\.gz|\.mdf|\.mrg|\.prx|\.bs|\.fig|\.sfc|\.smc|\.swx|\.pc2|\.wsc|\.ws)/

export const limitedRomRegex = /(\/([^\/"])+)+(?!\.AppImage)(\.zip|\.7z|\.iso|\.bin|\.chd|\.cue|\.img|\.a26|\.lnx|\.ngp|\.ngc|\.elf|\.n64|\.ndd|\.u1|\.v64|\.z64|\.nds|\.dmg|\.gbc|\.gba|\.gb|\.ciso|\.nes|\.fds|\.unif|\.unf|\.32x|\.cdi|\.gdi|\.m3u|\.gg|\.gen|\.md|\.smd|\.sms|\.ecm|\.mds|\.pbp|\.dump|\.gz|\.mdf|\.mrg|\.prx|\.bs|\.fig|\.sfc|\.smc|\.swx|\.pc2|\.wsc|\.ws)/;

export const scriptRegex = /(\/([^\/"])+)+(\.sh)/


export function getExe(details: SteamAppDetails){
	let replacedExe = details.strShortcutExe.replace(/['"]+/g, "");
	if (replacedExe.startsWith("/") || replacedExe.startsWith("~") || replacedExe.charAt(1) === ':')
		return details.strShortcutExe;
	else
		return `${details.strShortcutStartDir}/${details.strShortcutExe}`;
}

export function getLaunchCommand(details: SteamAppDetails){
	let exe = getExe(details);
	if (details.strShortcutLaunchOptions.includes("%command%"))
		return details.strShortcutLaunchOptions?.replace("%command%", exe);
	else
		return `${exe} ${details.strShortcutLaunchOptions}`;
}

export async function getShortcutCategories(launchCommand: string){
	let cats: (StoreCategory | CustomStoreCategory)[] = [CustomStoreCategory.NonSteam];
	if (isEpicGame(launchCommand))
		cats.push(CustomStoreCategory.Epic);
	if (isGOGGame(launchCommand))
		cats.push(CustomStoreCategory.GOG);
	if (isEmulatedGame(launchCommand))
		cats.push(StoreCategory.FullController, CustomStoreCategory.EmuDeck);
	if (isJunkStoreGame(launchCommand))
		cats.push(CustomStoreCategory.JunkStore);
	if (isNSLGame(launchCommand))
		cats.push(CustomStoreCategory.NSL);
	if (isHeroicGame(launchCommand))
		cats.push(CustomStoreCategory.Heroic);
	if (await isFlatpakGame(launchCommand))
		cats.push(CustomStoreCategory.Flatpak);
	return cats
}

export function isEmulatedGame(launchCommand: string){
	return romRegex.test(launchCommand) ||
		isRPCS3Game(launchCommand);
}

async function isFlatpakGame(launchCommand: string){
	const scriptPath = launchCommand.match(scriptRegex)?.[0];
	if (scriptPath)
	{
		try
		{
			return launchCommand.includes("flatpak") ||
				(await call<[string], string>("read_file", scriptPath)).includes("flatpak");
		}
		catch (e){ }
	}

	return launchCommand.includes("flatpak");
}

export function isEpicGame(launchCommand: string)
{
	// JunkStore, NSL, Heroic
	return launchCommand.includes("epic-launcher.sh") ||
		launchCommand.includes("com.epicgames.launcher://apps/") ||
		launchCommand.includes("heroic://launch/legendary/");
}

export function isGOGGame(launchCommand: string)
{
	// JunkStore, NSL, Heroic
	return launchCommand.includes("gog-launcher.sh") ||
		launchCommand.includes("/command=runGame /gameId=") ||
		launchCommand.includes("heroic://launch/gog/")
}

export function isUbisoftGame(launchCommand: string)
{
	return launchCommand.includes("uplay://");
}

export function isJunkStoreGame(launchCommand: string)
{
	return launchCommand.includes("epic-launcher.sh") ||
		launchCommand.includes("gog-launcher.sh")
}

const nslFolders = [
	"NonSteamLaunchers",
	"EpicGamesLauncher",
	"GogGalaxyLauncher",
	"UplayLauncher",
	"Battle.netLauncher",
	"TheEAappLauncher",
	"AmazonGamesLauncher",
	"itchioLauncher",
	"LegacyGamesLauncher",
	"HumbleGamesLauncher",
	"IndieGalaLauncher",
	"RockstarGamesLauncher",
	"GlyphLauncher",
	"PlaystationPlusLauncher",
	"VKPlayLauncher",
	"HoYoPlayLauncher",
	"NexonLauncher",
	"GameJoltLauncher",
	"ArtixGameLauncher",
	"ARCLauncher",
	"PokeTCGLauncher",
	"AntstreamLauncher",
	"PURPLELauncher",
	"PlariumLauncher",
	"VFUNLauncher",
	"TempoLauncher",
	"BigFishLauncher",
	"GryphlinkLauncher"
];
export function isNSLGame(launchCommand: string)
{
	return nslFolders.some(f => launchCommand.includes("/" + f + "/"));
}

export function isHeroicGame(launchCommand: string)
{
	return launchCommand.includes("heroic://")
}


export function isXemuGame(launchCommand: string)
{
	return launchCommand.includes("/xemu-emu.sh");
}

export function isXeniaGame(launchCommand: string)
{
	return launchCommand.includes("/xenia.sh");
}

export function isDuckstationGame(launchCommand: string)
{
	return launchCommand.includes("/duckstation.sh");
}

export function isPCSX2Game(launchCommand: string)
{
	return launchCommand.includes("/pcsx2-qt.sh") || launchCommand.includes("/pcsx2.sh");
}

export function isRPCS3Game(launchCommand: string)
{
	return launchCommand.includes("/rpcs3.sh");
}

export function isShadPS4Game(launchCommand: string)
{
	return launchCommand.includes("/shadps4.sh");
}

export function isPPSSPPGame(launchCommand: string)
{
	return launchCommand.includes("/ppsspp.sh");
}

export function isVita3KGame(launchCommand: string)
{
	return launchCommand.includes("/vita3k.sh");
}

export function isDolphinGame(launchCommand: string)
{
	return launchCommand.includes("/dolphin-emu.sh");
}

// https://wiki.dolphin-emu.org/index.php?title=GameIDs#System_Code
export function isGameCubeId6(id6: string): boolean{
	switch(id6[0]){
	case 'D':
	case 'G':
	case 'P':
		return true;
	}

	return false;
}

export function isCemuGame(launchCommand: string)
{
	return launchCommand.includes("/cemu.sh");
}

export function isMelonDSGame(launchCommand: string)
{
	return launchCommand.includes("/melonds.sh");
}

export function isMGBAGame(launchCommand: string)
{
	return launchCommand.includes("/mgba.sh");
}

export function isRosaliesMupenGUIGame(launchCommand: string)
{
	return launchCommand.includes("/rosaliesmupengui.sh");
}

export function isRyujinxGame(launchCommand: string)
{
	return launchCommand.includes("/ryujinx.sh");
}

export function isFlycastGame(launchCommand: string)
{
	return launchCommand.includes("/flycast.sh");
}