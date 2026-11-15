import {Fragment, useEffect, useState} from "react";
import {
	DialogButton, Dropdown,
	DropdownOption, Field, Focusable, SteamSpinner
} from "@decky/ui";
import {FaPlus, FaTrash} from "react-icons/fa";
import {IDDictionary, type EntryData, type ID} from "../Interfaces";
import {t} from "../useTranslations";
import { Provider } from "./Provider";
import { Module } from "./Module";
import { useMetaDeckState } from "../MetaDeckState";

interface IdOverrideDlcProps{
	// Source of parent apps: Module (State) > Provider (Module)
	source: Module<any, any> |
		Provider<any, any>;
	value: IDDictionary;
	disabled?: boolean;
	defaultResults?: (entries: EntryData[], appId: number, dlcId: number) => Promise<EntryData[]>;
	resultsForApp: (appId: number) => Promise<EntryData[]>;
	resultsForDlc: (appId: number, dlcId: number) => Promise<EntryData[]>;
	unpackAppAndDlc: (id: number) => [number, number];
	packAppAndDlc: (appId: number, dlcId: number) => number;
	onChange: (overrides: IDDictionary) => void;

	label?: string;
	description?: string;
}

interface OverrideDlcEntry extends EntryData{
	appDisplayName: string;
	appId: number;
}

function objectMap<K extends string | number | symbol, V, T>(object: Record<K, V>, mapFn: (key: K, value: V) => T){
	return Object.keys(object).reduce((result, key) => {
		result[key as K] = mapFn(key as K, object[key as K])
		return result
	}, {} as Record<K, T>);
}

export const IdOverrideDlcComponent = ({
		source,
		defaultResults,
		resultsForApp,
		resultsForDlc,
		unpackAppAndDlc,
		packAppAndDlc,
		onChange,
		value,
		disabled,
		label,
		description
	}: IdOverrideDlcProps) => {
	const { modules, overviews } = useMetaDeckState();
	const [entries, setEntries] = useState<Record<number, OverrideDlcEntry>>({});
	const [appOptions, setAppOptions] = useState<DropdownOption[]>([]);
	const [app, setApp] = useState<number>();
	const [dlcOptions, setDlcOptions] = useState<DropdownOption[]>([]);
	const [dlc, setDlc] = useState<number>();
	const [idOptions, setIdOptions] = useState<DropdownOption[]>([]);
	const [id, setId] = useState<OverrideDlcEntry>();
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		(async () => {
			setLoaded(false);
			const ret: Record<ID, OverrideDlcEntry> = {} as any;
			for (const [key, val] of Object.entries(value)){
				if (val === 0)
					continue;

				const [appId, dlc] = unpackAppAndDlc(+key);
				let result = (await resultsForDlc(appId, dlc)).find(r => r.id === val);
				if(result){
					let dlcs = await resultsForApp(appId);
					let dlcName = dlcs.find(d => d.id === dlc)?.title ?? '';
					let appDisplayName = appStore.GetAppOverviewByAppID(appId).display_name + ": " + dlcName;
					ret[key] = {
						...result,
						appDisplayName: appDisplayName,
						appId: +key
					};
				}
			}
			setEntries(ret);

			// Remove Nones if needed (above we just filtered them out without saving)
			if(Object.entries(value).some(v => v[1] === 0))
				onChange(objectMap(entries, (_, value) => value.id));

			setLoaded(true);
			modules.metadata.logger.debug("Loaded", ret);
		})();
	}, [value]);

	useEffect(() => {
		let appsSource;
		// Module (State)
		// Provider (Module)
		if(source instanceof Module)
			appsSource = overviews;
		else{
			appsSource = (source.module as Module<any, any>)
				.overviews;
		}

		setAppOptions(appsSource
			.filter(app => !Object.values(entries).some((value) => value.appId === app.appid))
			.map(app => ({
				label: app.display_name,
				data: app.appid
			}))
		);
	}, [entries]);

	useEffect(() => {
		(async () => {
			if(app){
				let results = await resultsForApp(app);

				setDlcOptions(results.map(value => ({
					label: value.title,
					data: value.id
				})));
			}
			else
				setDlcOptions([]);
		})();
	}, [app]);

	useEffect(() => {
		(async () => {
			if(app && dlc){
				let dlcs = await resultsForApp(app);
				let dlcName = dlcs.find(d => d.id === dlc)?.title ?? '';
				let results = await resultsForDlc(app, dlc);
				let selected = defaultResults ? await defaultResults(results, app, dlc) : [];
				let appDisplayName = appStore.GetAppOverviewByAppID(app).display_name + ": " + dlcName;

				// Set selected first, if any
				setIdOptions(results
					.filter(r => selected.some(s => s.id === r.id))
					.concat(results.filter(r => !selected.some(s => s.id === r.id)))
					.map(value => ({
						label: `${value.title} (${value.id})`,
						data: value,
						appDisplayName: appDisplayName,
						appId: packAppAndDlc(app, dlc)
					})));
			}
			else
				setIdOptions([]);
		})();
	}, [dlc]);

	return <Fragment>
		<Field
			label={(label ?? t("settingsOverrides"))}
			description={(description ?? t("settingsOverridesDesc"))}
			childrenLayout={"below"}
			bottomSeparator={"thick"}
		>
			<Focusable
				style={{
					display: "flex",
					marginLeft: "auto",
					height: "40px"
				}}
			>
				<div style={{height: '40px', minWidth: '60px', marginRight: '10px', flexGrow: "2"}}>
					<Dropdown
						disabled={disabled}
						rgOptions={appOptions}
						selectedOption={app}
						onChange={(value) => {
							setApp(value.data);
							setDlc(undefined);
							setId(undefined);
							modules.metadata.logger.debug("Set", app, dlc, id);
						}}
					/>
				</div>
				<div style={{height: '40px', minWidth: '60px', marginRight: '10px', flexGrow: "2"}}>
					<Dropdown
						disabled={disabled}
						rgOptions={dlcOptions}
						selectedOption={dlc}
						onChange={(value) => {
							setDlc(value.data);
							setId(undefined);
							modules.metadata.logger.debug("Set", app, dlc, id);
						}}
					/>
				</div>
				<div style={{height: '40px', minWidth: '60px', marginRight: '10px', flexGrow: "2"}}>
					<Dropdown
						disabled={disabled}
						rgOptions={idOptions}
						selectedOption={id}
						onChange={(value) => {
							setId(value.data);
							modules.metadata.logger.debug("Set", app, dlc, id);
						}}
					/>
				</div>
				<DialogButton
					disabled={disabled}
					style={{
						height: '40px',
						width: '40px',
						padding: '10px 12px',
						minWidth: '40px',
						display: 'flex',
						flexDirection: 'column',
						justifyContent: 'center',
					}}
					onClick={() => {
						if (app && dlc !== undefined && id){
							const obj = (entries);
							obj[packAppAndDlc(app, dlc)] = id;
							modules.metadata.logger.debug("Add", app, dlc, id);
							onChange(objectMap(obj, (_, value) => value.id));
						}
					}}>
					<FaPlus/>
				</DialogButton>
			</Focusable>
		</Field>

		{loaded ? <Fragment>
			{
				Object.values(entries)
					.sort((a, b) => a.appDisplayName.localeCompare(b.appDisplayName))
					.map((entry) =>

					<Field
						label={entry.appDisplayName}
						childrenLayout={"inline"}
						bottomSeparator={"standard"}
					>
						<Focusable
							style={{
								display: "flex",
								marginLeft: "auto",
								height: "40px",
								alignItems: "center"
							}}
						>
							<div style={{
								height: '40px',
								minWidth: '60px',
								marginRight: '10px',
								flexGrow: "2",
								alignContent: "center"
							}}>

								{`${entry.title}${(entry.id !== entry.title ? ` (${entry.id})` : "")}`}
							</div>
							<DialogButton
								style={{
									height: '40px',
									width: '40px',
									padding: '10px 12px',
									minWidth: '40px',
									display: 'flex',
									flexDirection: 'column',
									justifyContent: 'center',
								}}
								disabled={disabled}
								onClick={() => {
									const obj = (entries);
									delete obj[entry.appId];
									onChange(objectMap(obj, (_, value) => value.id));
									setApp(undefined);
									setDlc(undefined);
									setId(undefined);
								}}
							>
								<FaTrash/>
							</DialogButton>
						</Focusable>
					</Field>
				)
			}
		</Fragment> : <SteamSpinner/>}
	</Fragment>
}