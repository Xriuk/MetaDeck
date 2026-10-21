import {MetaDeckState} from "./MetaDeckState";
import Logger from "./logger";
import {systemClock} from "./System";
import {call} from "@decky/api";
import {ModuleCaches, ModuleConfigs} from "./modules/Module";
import {merge} from "lodash-es";
import { Mutex } from "async-mutex";
import type { ResolverConfigs, ResolverCaches } from "./modules/Resolver";

export type ConfigData = {
	excluded_apps: number[];
	modules: ModuleConfigs;
	resolvers: ResolverConfigs;
}

export type CacheData = {
	modules: ModuleCaches;
	resolvers: ResolverCaches;
}

export class Settings
{
	private readonly state: MetaDeckState;
	private readonly logger: Logger;

	private readonly packet_size: number = 4000; // chars

	static readonly defaultConfig: ConfigData = {
		excluded_apps: [],
		modules: {
			metadata: {
				enabled: true,
				type_override: true,
				descriptions: true,
				release_date: true,
				associations: true,
				categories: true,
				markdown: true,
				title_header: true,
				rating: true,
				install_size: true,
				install_date: true,
				excluded_apps: [],
				providers_overrides: {},
				providers: {
					// Id-based (localized)
					titledb: {
						enabled: true,
						excluded_apps: [],
						language: null,
						resolvers: {
							ryujinx_titleid: {
								enabled: true
							}
						}
					},
					gametdb: {
						enabled: true,
						excluded_apps: [],
						language: null,
						resolvers: {
							dolphin: {
								enabled: true
							},
							cemu: {
								enabled: true
							},
							ryujinx_serial: {
								enabled: true
							},
							rpcs3: {
								enabled: true
							}
						}
					},
					// Id-based (english)
					gog: { // Can resolve to Steam if finds id
						enabled: true,
						language: null,
						excluded_apps: [],
						resolvers: {
							gog_junk: {
								enabled: true
							},
							gog_nsl: {
								enabled: true
							},
							gog_heroic: {
								enabled: true
							}
						}
					},
					// Id-based/Fuzzy search (localized)
					steam: {
						enabled: true,
						fuzziness: 5,
						overrides: {},
						language: null,
						excluded_apps: [],
						resolvers: {}
					},
					// Fuzzy search (english)
					lizardbyte: { // Can resolve to Steam if finds id
						enabled: true,
						fuzziness: 5,
						excluded_apps: [],
						overrides: {},
						resolvers: {}
					},
					rawg: {
						enabled: true,
						fuzziness: 5,
						api_key: '',
						excluded_apps: [],
						overrides: {},
						resolvers: {}
					},
					// Id-based (fallback)
					ra: {
						enabled: true,
						excluded_apps: [],
						resolvers: {}
					}
				}
			},
			compatdata: {
				enabled: true,
				verified: true,
				notes: true,
				test_results: true,
				excluded_apps: [],
				providers_overrides: {},
				providers: {
					// Id-based
					pcsx2: {
						enabled: true,
						excluded_apps: [],
						resolvers: {
							pcsx2: {
								enabled: true
							}
						}
					},
					rpcs3: {
						enabled: true,
						excluded_apps: [],
						resolvers: {
							rpcs3: {
								enabled: true
							}
						}
					},
					xenia: {
						enabled: true,
						excluded_apps: [],
						resolvers: {
							xenia: {
								enabled: true
							}
						}
					},
					// Id-based, fallback to fuzzy search
					dolphin: {
						enabled: true,
						fuzziness: 5,
						excluded_apps: [],
						overrides: {},
						resolvers: {
							dolphin: {
								enabled: true
							}
						}
					},
					// Fuzzy search
					cemu: {
						enabled: true,
						fuzziness: 5,
						excluded_apps: [],
						overrides: {},
						resolvers: {}
					},
					emudeck: {
						enabled: true,
						fuzziness: 5,
						excluded_apps: [],
						overrides: {},
						resolvers: {}
					}
				}
			},
			achievements: {
				enabled: true,
				category: true,
				app_details: true,
				overlay_menu: true,
				excluded_apps: [],
				providers_overrides: {},
				providers: {
					ra: {
						enabled: true,
						username: '',
						api_key: '',
						points: true,
						excluded_apps: [],
						resolvers: {
							ra: {
								enabled: true
							}
						}
					},
					rpcs3: {
						enabled: true,
						user_path: '/home/deck/Emulation/storage/rpcs3/dev_hdd0/home/00000001',
						language: null,
						trophy_categories: true,
						psn_npsso: '',
						trophy_sets: true,
						excluded_apps: [],
						resolvers: {
							rpcs3_npwr: {
								enabled: true
							}
						}
					},
					xenia: {
						enabled: true,
						user_path: '',
						language: null,
						gamerscore: true,
						description_locked: null,
						excluded_apps: [],
						resolvers: {
							xenia: {
								enabled: true
							}
						}
					}
				}
			}
		},
		resolvers: {
			ra: {},
			pcsx2: {},
			rpcs3: {},
			rpcs3_npwr: {
				hdd_path: '/home/deck/Emulation/storage/rpcs3/dev_hdd0/'
			},
			xenia: {},
			dolphin: {},
			cemu: {},
			ryujinx_titleid: {},
			ryujinx_serial: {},
			gog_nsl: {},
			gog_junk: {},
			gog_heroic: {}
		}
	}

	static readonly defaultCache: CacheData = {
		modules: {
			metadata: {
				data: {},
				data_providers: {},
				providers: {
					gog: {},
					steam: {},
					rawg: {},
					gametdb: {},
					lizardbyte: {},
					ra: {},
					titledb: {}
				}
			},
			compatdata: {
				data: {},
				data_providers: {},
				providers: {
					emudeck: {},
					pcsx2: {},
					rpcs3: {},
					xenia: {},
					dolphin: {},
					cemu: {}
				}
			},
			achievements: {
				data: {},
				data_providers: {},
				providers: {
					ra: {
						game_info: {}
					},
					rpcs3: {
						game_trophies: {}
					},
					xenia: {
						game_achievements: {}
					}
				}
			}
		},
		resolvers: {
			gog_junk: {},
			gog_nsl: {},
			gog_heroic: {},
			dolphin: {
				game_id6s: {}
			},
			cemu: {
				game_codes: {}
			},
			ryujinx_titleid: {
				title_ids: {},
				ryujinx_prod_keys: undefined
			},
			// Not used, uses ryujinx_titleid above instead
			ryujinx_serial: {
				title_ids: {},
				ryujinx_prod_keys: undefined
			},
			rpcs3: {
				title_ids: {}
			},
			rpcs3_npwr: {
				npwr_ids: {}
			},
			pcsx2: {
				title_ids: {}
			},
			xenia: {
				title_ids: {}
			},
			ra: {
				hashes: {}
			}
		}
	}

	configData: ConfigData = merge({}, Settings.defaultConfig);
	private readonly configMutex = new Mutex();
	private configRead = false; // To avoid writing before reading
	private configAllowSaving = true;

	cacheData: CacheData = merge({}, Settings.defaultCache);
	private readonly cacheMutex = new Mutex();
	private cacheRead = false; // To avoid writing before reading
	private cacheAllowSaving = true;

	constructor(state: MetaDeckState){
		this.state = state;
		this.logger = new Logger("Settings");
	}


	private createProxy<T extends object>(targetObj: T, name: string): T{
		const self: Settings = this;

		const createHandler = <T>(path: string[] = []) => ({
			get: (target: T, key: keyof T): any => {
				if (key == 'isProxy')
					return true;

				if (typeof target[key] === 'object' && target[key] != null){
					return new Proxy(
						target[key],
						createHandler<any>([...path, key as string])
					);
				}

				return target[key];
			},
			set: (target: T, key: keyof T, value: any) =>  {
				self.logger.debug(`Setting ${name} ${[...path, key]} to: `, value);

				target[key] = value;

				self.state.notifyUpdate();
				return true;
			},
			deleteProperty: (target: T, key: keyof T) => {
				self.logger.debug(`Deleting ${name} ${[...path, key]}`);

				delete target[key];

				self.state.notifyUpdate();
				return true;
			}
		});

		return new Proxy(targetObj, createHandler<T>() as any);
	}

	public get config(): ConfigData{
		return this.createProxy(this.configData, 'config');
	}

	public get cache(): CacheData{
		return this.createProxy(this.cacheData, 'cache');
	}
	

	public async readSettings(): Promise<void>{
		this.logger.debug("Reading settings...");
		const start = systemClock.getTimeMs();
		await this.readConfig();
		await this.readCache();
		const end = systemClock.getTimeMs();
		this.logger.debug("Read settings in " + (end - start) + "ms");
	}

	public async writeSettings(): Promise<void>{
		this.logger.debug("Writing settings...");
		const start = systemClock.getTimeMs();
		await this.writeConfig();
		await this.writeCache();
		const end = systemClock.getTimeMs();
		this.logger.debug("Wrote settings in " + (end - start) + "ms");
	}


	private async readConfig(): Promise<void>{
		const release = await this.configMutex.acquire();
		try{
			this.logger.debug("Reading config...");
			const start = systemClock.getTimeMs();

			let buffer = "";
			try{
				const length = await call<[number], number>("start_read_config", this.packet_size);
				for (let i = 0; i < length; i++){
					buffer += await call<[number], string>("read_config", i);
				}
				this.logger.debug("Config buffer", buffer);
			}
			catch(e){
				this.logger.error("Error while reading config", e);
			}

			this.configData = merge({}, Settings.defaultConfig, JSON.parse(buffer || "{}"));
			const end = systemClock.getTimeMs();
			this.logger.debug("Read config in " + (end - start) + "ms", this.configData);

			this.configRead = true;
		}
		finally{
			release();
		}
	}

	public async writeConfig(): Promise<void>{
		const release = await this.configMutex.acquire();
		try{
			if(!this.configRead || !this.configAllowSaving)
				return;

			this.logger.debug("Writing config...");
			const start = systemClock.getTimeMs();

			const buffer = JSON.stringify(this.configData);
			const chunks = Math.ceil(buffer.length / this.packet_size);
			await call<[number], void>("start_write_config", chunks);
			for (let i = 0; i < chunks; i++){
				const data = buffer.slice(i * this.packet_size, (i + 1) * this.packet_size);
				await call<[number, string], void>("write_config", i, data);
			}

			const end = systemClock.getTimeMs();
			this.logger.debug("Wrote config in " + (end - start) + "ms", this.configData);
		}
		finally{
			release();
		}
	}


	private async readCache(): Promise<void>{
		const release = await this.cacheMutex.acquire();
		try{
			this.logger.debug("Reading cache...");
			const start = systemClock.getTimeMs();

			let buffer = "";
			try{
				const length = await call<[number], number>("start_read_cache", this.packet_size);
				for (let i = 0; i < length; i++){
					buffer += await call<[number], string>("read_cache", i);
				}
				this.logger.debug("Cache buffer", buffer);
			}
			catch(e){
				this.logger.error("Error while reading cache", e);
			}

			this.cacheData = merge({}, Settings.defaultCache, JSON.parse(buffer || "{}"));
			const end = systemClock.getTimeMs();
			this.logger.debug("Read cache in " + (end - start) + "ms", this.cacheData);

			this.cacheRead = true;
		}
		finally{
			release();
		}
	}

	public async writeCache(): Promise<void>{
		const release = await this.cacheMutex.acquire();
		try{
			if(!this.cacheRead || !this.cacheAllowSaving)
				return;

			this.logger.debug("Writing cache...");
			const start = systemClock.getTimeMs();

			const buffer = JSON.stringify(this.cacheData);
			const chunks = Math.ceil(buffer.length / this.packet_size);
			await call<[number], void>("start_write_cache", chunks);
			for (let i = 0; i < chunks; i++){
				const data = buffer.slice(i * this.packet_size, (i + 1) * this.packet_size);
				await call<[number, string], void>("write_cache", i, data);
			}

			const end = systemClock.getTimeMs();
			this.logger.debug("Wrote cache in " + (end - start) + "ms", this.cacheData);
		}
		finally{
			release();
		}
	}


	public async runInDisabledSaveState(action: () => Promise<void>): Promise<void>{
		let configAllowSavingBackup: boolean;
		let releaseConfig = await this.configMutex.acquire();
		try{
			configAllowSavingBackup = this.configAllowSaving;
			this.configAllowSaving = false;
		}
		finally{
			releaseConfig();
		}

		try{
			let cacheAllowSavingBackup: boolean;
			let releaseCache = await this.cacheMutex.acquire();
			try{
				cacheAllowSavingBackup = this.cacheAllowSaving;
				this.cacheAllowSaving = false;
			}
			finally{
				releaseCache();
			}
			
			try{
				await action();
			}
			finally{
				releaseCache = await this.cacheMutex.acquire();
				try{
					this.cacheAllowSaving = cacheAllowSavingBackup;
				}
				finally{
					releaseCache();
				}
			}
		}
		finally{
			releaseConfig = await this.configMutex.acquire();
			try{
				this.configAllowSaving = configAllowSavingBackup;
			}
			finally{
				releaseConfig();
			}
		}
	}
}