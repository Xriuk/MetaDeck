import {MetaDeckState} from "./MetaDeckState";
import Logger from "./logger";
import {systemClock} from "./System";
import {callable} from "@decky/api";
import {ModuleCaches, ModuleConfigs} from "./modules/Module";
import {merge} from "lodash-es";
import { Mutex } from "async-mutex";

export type ConfigData = {
	excluded_apps: number[];
	modules: ModuleConfigs;
}

export type CacheData = {
	modules: ModuleCaches;
}

export class Settings
{
	private readonly state: MetaDeckState;
	private readonly logger: Logger;

	private read_config = callable<[], ConfigData>("read_config")
	private write_config = callable<[ConfigData], void>("write_config")
	private read_cache = callable<[], CacheData>("read_cache")
	private write_cache = callable<[CacheData], void>("write_cache")

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
				providers: {
					// Id-based (localized)
					gametdb: {
						enabled: true,
						ordinal: 0,
						excluded_apps: [],
						resolvers: {
							dolphin: {
								enabled: true,
								ordinal: 0
							},
							cemu: {
								enabled: true,
								ordinal: 1
							},
							switch: {
								enabled: true,
								ordinal: 2
							},
							rpcs3: {
								enabled: true,
								ordinal: 3
							}
						},
						language: "EN"
					},
					// Id-based (english)
					gog: { // Can resolve to Steam if finds id
						enabled: true,
						ordinal: 1,
						excluded_apps: [],
						resolvers: {
							junk: {
								enabled: true,
								ordinal: 0
							},
							nsl: {
								enabled: true,
								ordinal: 1
							},
							heroic: {
								enabled: true,
								ordinal: 2
							}
						}
					},
					// Id-based/Fuzzy search (localized)
					steam: {
						enabled: true,
						ordinal: 2,
						fuzziness: 5,
						overrides: {},
						language: "english",
						excluded_apps: [],
						resolvers: {}
					},
					// Fuzzy search (english)
					lizardbyte: { // Can resolve to Steam if finds id
						enabled: true,
						ordinal: 3,
						fuzziness: 5,
						excluded_apps: [],
						overrides: {},
						resolvers: {}
					},
					rawg: {
						enabled: true,
						ordinal: 4,
						fuzziness: 5,
						api_key: '',
						excluded_apps: [],
						overrides: {},
						resolvers: {}
					},
					// Id-based (fallback)
					ra: {
						enabled: true,
						ordinal: 5,
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
				providers: {
					// Id-based
					pcsx2: {
						enabled: true,
						ordinal: 0,
						excluded_apps: [],
						resolvers: {
							pcsx2: {
								enabled: true,
								ordinal: 0
							}
						}
					},
					rpcs3: {
						enabled: true,
						ordinal: 1,
						excluded_apps: [],
						resolvers: {
							rpcs3: {
								enabled: true,
								ordinal: 0
							}
						}
					},
					xenia: {
						enabled: true,
						ordinal: 2,
						excluded_apps: [],
						resolvers: {
							xenia: {
								enabled: true,
								ordinal: 0
							}
						}
					},
					// Id-based, fallback to fuzzy search
					dolphin: {
						enabled: true,
						ordinal: 3,
						fuzziness: 5,
						excluded_apps: [],
						overrides: {},
						resolvers: {
							dolphin: {
								enabled: true,
								ordinal: 0
							}
						}
					},
					cemu: {
						enabled: true,
						ordinal: 4,
						fuzziness: 5,
						excluded_apps: [],
						overrides: {},
						resolvers: {}
					},
					// Fuzzy search
					emudeck: {
						enabled: true,
						ordinal: 5,
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
				providers: {
					ra: {
						enabled: true,
						ordinal: 0,
						username: '',
						api_key: '',
						points: true,
						excluded_apps: [],
						resolvers: {
							ra: {
								enabled: true,
								ordinal: 0
							}
						}
					},
					rpcs3: {
						enabled: true,
						ordinal: 1,
						user_path: '/home/deck/Emulation/storage/rpcs3/dev_hdd0/home/00000001',
						language: 'EN',
						trophy_categories: true,
						psn_npsso: '',
						excluded_apps: [],
						resolvers: {
							rpcs3: {
								enabled: true,
								ordinal: 0,
								hdd_path: '/home/deck/Emulation/storage/rpcs3/dev_hdd0/'
							}
						}
					},
					xenia: {
						enabled: true,
						ordinal: 2,
						user_path: '',
						language: 'EN',
						gamerscore: true,
						description_locked: null,
						excluded_apps: [],
						resolvers: {
							xenia: {
								enabled: true,
								ordinal: 0
							}
						}
					}
				}
			}
		}
	}

	static readonly defaultCache: CacheData = {
		modules: {
			metadata: {
				data: {},
				data_providers: {},
				providers: {
					gog: {
						resolvers: {
							junk: {},
							nsl: {},
							heroic: {}
						}
					},
					steam: {
						resolvers: {}
					},
					rawg: {
						resolvers: {}
					},
					gametdb: {
						resolvers: {
							dolphin: {
								game_id6s: {}
							},
							cemu: {
								game_codes: {}
							},
							switch: {
								title_ids: {}
							},
							rpcs3: {
								title_ids: {}
							}
						}
					},
					lizardbyte: {
						resolvers: {}
					},
					ra: {
						resolvers: {}
					}
				}
			},
			compatdata: {
				data: {},
				data_providers: {},
				providers: {
					emudeck: {
						resolvers: {}
					},
					pcsx2: {
						resolvers: {
							pcsx2: {
								title_ids: {}
							}
						}
					},
					rpcs3: {
						resolvers: {
							rpcs3: {
								title_ids: {}
							}
						}
					},
					xenia: {
						resolvers: {
							xenia: {
								title_ids: {}
							}
						}
					},
					dolphin: {
						resolvers: {
							dolphin: {
								game_id6s: {}
							}
						}
					},
					cemu: {
						resolvers: {}
					}
				}
			},
			achievements: {
				data: {},
				data_providers: {},
				providers: {
					ra: {
						game_info: {},
						resolvers: {
							ra: {
								hashes: {}
							}
						}
					},
					rpcs3: {
						game_trophies: {},
						resolvers: {
							rpcs3: {
								npwr_ids: {}
							}
						}
					},
					xenia: {
						game_achievements: {},
						resolvers: {
							xenia: {
								title_ids: {}
							}
						}
					}
				}
			}
		}
	}

	configData: ConfigData = merge({}, Settings.defaultConfig);
	private readonly configMutex = new Mutex();
	private configRead = false; // To avoid writing before reading

	cacheData: CacheData = merge({}, Settings.defaultCache);
	private readonly cacheMutex = new Mutex();
	private cacheRead = false; // To avoid writing before reading

	constructor(state: MetaDeckState)
	{
		this.state = state;
		this.logger = new Logger("Settings");
	}


	get config(): ConfigData
	{
		const self: Settings = this;
		const createHandler = <T>(path: string[] = []) => ({
			get: (target: T, key: keyof T): any => {
				if (key == 'isProxy') return true;
				if (typeof target[key] === 'object' && target[key] != null)
					return new Proxy(
						   target[key],
						   createHandler<any>([...path, key as string])
					);
				return target[key];
			},
			set: (target: T, key: keyof T, value: any) =>  {
				self.logger.debug(`Setting ${[...path, key]} to: `, value);
				target[key] = value;
				void self.writeConfig();
				self.state.notifyUpdate();
				return true;
			}
		});

		return new Proxy(this.configData, createHandler<ConfigData>());
	}

	get cache(): CacheData
	{
		const self: Settings = this

		const createHandler = <T>(path: string[] = []) => ({
			get: (target: T, key: keyof T): any => {
				if (key == 'isProxy') return true;
				if (typeof target[key] === 'object' && target[key] != null)
					return new Proxy(
						   target[key],
						   createHandler<any>([...path, key as string])
					);
				return target[key];
			},
			set: (target: T, key: keyof T, value: any) =>  {
				self.logger.debug(`Setting ${[...path, key]} to: `, value);
				target[key] = value;
				void self.writeCache();
				self.state.notifyUpdate();
				return true;
			}
		});

		return new Proxy(self.cacheData, createHandler<CacheData>());
	}

	async readSettings(): Promise<void>
	{
		this.logger.debug("Reading settings...");
		const start = systemClock.getTimeMs();
		await this.readConfig();
		await this.readCache();
		const end = systemClock.getTimeMs();
		this.logger.debug("Read settings in " + (end - start) + "ms");
	}

	async writeSettings(): Promise<void>
	{
		this.logger.debug("Writing settings...");
		const start = systemClock.getTimeMs();
		await this.writeConfig();
		await this.writeCache();
		const end = systemClock.getTimeMs();
		this.logger.debug("Wrote settings in " + (end - start) + "ms");
	}

	private async readConfig(): Promise<void>
	{
		const release = await this.configMutex.acquire();
		try{
			this.logger.debug("Reading config...");
			const start = systemClock.getTimeMs();
			this.configData = merge({}, Settings.defaultConfig, await this.read_config() ?? {});
			const end = systemClock.getTimeMs();
			this.logger.debug("Read config in " + (end - start) + "ms", this.configData);

			this.configRead = true;
		}
		finally{
			release();
		}
	}

	private async writeConfig(): Promise<void>
	{
		const release = await this.configMutex.acquire();
		try{
			if(!this.configRead)
				return;

			this.logger.debug("Writing config...");
			const start = systemClock.getTimeMs();
			await this.write_config(this.configData);
			const end = systemClock.getTimeMs();
			this.logger.debug("Wrote config in " + (end - start) + "ms", this.configData);
		}
		finally{
			release();
		}
	}

	private async readCache(): Promise<void>
	{
		const release = await this.cacheMutex.acquire();
		try{
			this.logger.debug("Reading cache...");
			const start = systemClock.getTimeMs();
			this.cacheData = merge({}, Settings.defaultCache, await this.read_cache() ?? {});
			const end = systemClock.getTimeMs();
			this.logger.debug("Read cache in " + (end - start) + "ms", this.cacheData);

			this.cacheRead = true;
		}
		finally{
			release();
		}
	}

	private async writeCache(): Promise<void>
	{
		const release = await this.cacheMutex.acquire();
		try{
			if(!this.cacheRead)
				return;

			this.logger.debug("Writing cache...");
			const start = systemClock.getTimeMs();
			await this.write_cache(this.cacheData);
			const end = systemClock.getTimeMs();
			this.logger.debug("Wrote cache in " + (end - start) + "ms", this.cacheData);
		}
		finally{
			release();
		}
	}
}