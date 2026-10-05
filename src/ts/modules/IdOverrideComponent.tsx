import {Fragment, useEffect, useState} from "react";
import {
	DialogButton, Dropdown,
	DropdownOption, Field, Focusable, SteamSpinner
} from "@decky/ui";
import {FaPlus, FaTrash} from "react-icons/fa";
import {IDDictionary} from "../Interfaces";
import {t} from "../useTranslations";
import type { Provider } from "./Provider";
import type { Module } from "./Module";

interface IdOverrideProps<T extends number | string>
{
	// Source of parent apps Provider (Module)
	provider: Provider<any, any, any, any, any, any, any, any, any, any, any, any>,
	value: IDDictionary,
	disabled?: boolean,
	resultsForApp: (appId: number) => Promise<Record<T, OverrideEntry<T>>>,
	onChange: (overrides: IDDictionary) => void
}

export interface OverrideEntry<T extends number | string>
{
	label: string,
	title: string,
	id: T,
	appId: number
}

function objectMap<K extends string | number | symbol, V, T>(object: Record<K, V>, mapFn: (key: K, value: V) => T)
{
	return Object.keys(object).reduce((result, key) => {
		result[key as K] = mapFn(key as K, object[key as K])
		return result
	}, {} as Record<K, T>);
}

export const IdOverrideComponent = <T extends number | string>({
		provider,
		resultsForApp,
		onChange,
		value,
		disabled
	}: IdOverrideProps<T>) => {
	const [app, setApp] = useState<number>();
	const [id, setId] = useState<OverrideEntry<T>>();
	const [appOptions, setAppOptions] = useState<DropdownOption[]>([]);
	const [idOptions, setIdOptions] = useState<DropdownOption[]>([]);
	const [entries, setEntries] = useState<Record<number, OverrideEntry<T>>>({});
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		(async () => {
			setLoaded(false);
			const ret: Record<T, OverrideEntry<T>> = {} as any;
			for (const [key, val] of Object.entries(value))
			{
				if (val !== 0)
					ret[key as T] = (await resultsForApp(+key))[val as T];
			}
			setEntries(ret);

			// Remove Nones
			if(Object.entries(value).some(v => v[1] === 0))
				onChange(objectMap(entries, (_, value) => value.id));

			setLoaded(true);
			provider.module.logger.debug("Loaded", ret);
		})()
	}, [value]);

	useEffect(() => setAppOptions((provider.module as Module<any, any, any, any, any, any, any, any, any, any, any>)
		.overviews
		.filter(app => !Object.values(entries).some((value) => value.appId === app.appid))
		.map(app => ({
			label: app.display_name,
			data: app.appid
		}))
	), [entries]);

	useEffect(() => {
		(async () => {
			setIdOptions(!!app ? Object.values<OverrideEntry<T>>(await resultsForApp(app)).map(value => ({
				label: `${value.title} (${value.id})`,
				data: value
			})) : [])
		})()
	}, [app]);

	return <Fragment>
		<Field
			label={t("settingsOverrides")}
			description={t("settingsOverridesDesc")}
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
							setId(undefined);
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
						if (id){
							const obj = (entries);
							obj[id.appId] = id;
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
					.sort((a, b) => a.label.localeCompare(b.label))
					.map((entry) =>

					<Field
						label={entry.label}
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

								{`${entry.title} (${entry.id})`}
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