import {Fragment, useEffect, useState} from "react";
import {
	DialogButton, Dropdown,
	DropdownOption, Field, Focusable, SteamSpinner
} from "@decky/ui";
import {useMetaDeckState} from "../MetaDeckState";
import {FaPlus, FaTrash} from "react-icons/fa";
import {t} from "../useTranslations";
import type { Provider } from "./Provider";
import { Module } from "./Module";

interface ExcludeAppProps
{
	// Source of parent apps Undefined (root) > Module (State) > Provider (Module)
	source?: undefined |
		Module<any, any, any, any, any, any, any, any, any, any, any> |
		Provider<any, any, any, any, any, any, any, any, any, any, any, any>,
	value: number[],
	disabled?: boolean,
	onChange: (overrides: number[]) => void
}

interface ExcludeEntry
{
	label: string,
	appId: number
}

export const ExcludeAppComponent = ({
		source,
		onChange,
		value,
		disabled
	}: ExcludeAppProps) => {
	const {modules, overviews, rootOverviews } = useMetaDeckState();
	const [app, setApp] = useState<number>();
	const [appOptions, setAppOptions] = useState<DropdownOption[]>([]);
	const [entries, setEntries] = useState<ExcludeEntry[]>([]);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		(() => {
			setLoaded(false);
			const ret: ExcludeEntry[] = Array.from(new Set(value)).map(a => ({
				label: appStore.GetAppOverviewByAppID(a).display_name,
				appId: a
			}));
			setEntries(ret);
			setLoaded(true);
			modules.metadata.logger.debug("Loaded", ret);
		})()
	}, [value]);

	useEffect(() => {
		let appsSource;
		// root
		// Module (State)
		// Provider (Module)
		if(source == null)
			appsSource = rootOverviews;
		else if(source instanceof Module)
			appsSource = overviews;
		else{
			appsSource = (source.module as Module<any, any, any, any, any, any, any, any, any, any, any>)
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

	return <Fragment>
		<Field
			   label={t("settingsExclusions")}
			   description={t("settingsExclusionsDesc")}
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
				<div style={{height: '40px', minWidth: '120px', marginRight: '10px', flexGrow: "2"}}>
					<Dropdown
						disabled={disabled}
						rgOptions={appOptions}
						selectedOption={app}
						onChange={(value) => setApp(value.data)}
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
						const obj = (entries)
						if(app && !obj.some(o => o.appId === app)){
							obj.push({
								label: appStore.GetAppOverviewByAppID(app).display_name,
								appId: app
							});
							onChange(obj.map(e => e.appId));
						}
					}}>
					<FaPlus/>
				</DialogButton>
			</Focusable>
		</Field>

		{loaded ? <Fragment>
			{
				entries
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
									const index = obj.findIndex(e => e.appId === entry.appId);
									if(index !== -1){
										obj.splice(index, 1);
										onChange(obj.map(e => e.appId));
									}
									setApp(undefined);
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