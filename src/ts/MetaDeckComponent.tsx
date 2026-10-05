import {useMetaDeckState} from "./MetaDeckState";
import {FC, useEffect, useState, type CSSProperties} from "react";
import {useTranslations} from "./useTranslations";
import {ButtonItem, PanelSection, PanelSectionRow, Navigation, Field, ProgressBar} from "@decky/ui";
import {FaArrowLeft, FaCog, FaSync, FaTrash} from "react-icons/fa";
import React from "react";
import { truncate } from "lodash-es";

const SettingsButton: FC = () =>
{
	const t = useTranslations();

	return (
		<ButtonItem
			layout="below"
			onClick={() =>
			{
				Navigation.CloseSideMenus();
				Navigation.Navigate("/metadeck/settings");
			}}
		>
			<div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
				<FaCog />
				<span style={{ marginLeft: "auto", textAlign: "right", width: "100%" }}>{t("settings")}</span>
			</div>
		</ButtonItem>
	);
};

const RefreshButton: FC = () =>
{
	const t = useTranslations();
	const { refresh } = useMetaDeckState();

	return (
		<ButtonItem
			layout="below"
			onClick={() => 
			{
				void refresh();
			}}
		>
			<div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
				<FaSync />
				<span style={{ marginLeft: "auto", textAlign: "right", width: "100%" }}>{t("refresh")}</span>
			</div>
		</ButtonItem>
	);
};

const CacheButton: FC = () =>
{
	const t = useTranslations();
	const { clear } = useMetaDeckState();

	return (
		<ButtonItem 
			layout="below"
			onClick={() => 
			{
				void clear();
			}}
		>
			<div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
				<FaTrash />
				<span style={{ marginLeft: "auto", textAlign: "right", width: "100%" }}>{t("clear")}</span>
			</div>
		</ButtonItem>
	);
};

const LoadingProgressBar: FC = () =>
{
	const t = useTranslations();
	const { loadingData } = useMetaDeckState();
	const [css, setCss] = useState<CSSProperties>();
	useEffect(() =>
	{
		const def: CSSProperties = { };
		if (loadingData.currentModule?.error) 
			def.color = "red";
		setCss(def);
	}, [loadingData]);

	return <>
		<Field
			label={t("loading")}
			description={`${(loadingData.currentModule?.module.title ? loadingData.currentModule.module.title + (loadingData.currentModule.total ? ` - ${loadingData.currentModule.processed}/${loadingData.currentModule.total}` : '') : undefined)}`}
			bottomSeparator="none"
		/>
		<ProgressBar
			focusable={false}
			indeterminate={!loadingData.currentModule?.total}
			nProgress={loadingData.percentage}
		/>
		<Field
			label={loadingData.currentModule?.game}
			description={
				<div style={css} className="ProgressBarDescription_debug">
					{(loadingData.currentModule?.error) ? <>{t("error")}<br /></> : undefined}
					{loadingData.currentModule?.error ? <>{loadingData.currentModule.error.name}<br />{loadingData.currentModule.error.stack}</> : loadingData.currentModule?.description}
				</div>}
			bottomSeparator="none"
		/>
	</>;
};

let activeModule: string | null = null;
const ModulesList: FC = () => {
	const t = useTranslations();
	const { modules } = useMetaDeckState();
	const [active, setActive] = useState(activeModule);
	
	return <>
		{
			active &&
			<PanelSectionRow key='back'>
				<Field
					label={t('back')}
					childrenLayout="below"
					icon={<FaArrowLeft/>}
					onActivate={() => {
						setActive(null);
						activeModule = null;
					}}>
				</Field>
			</PanelSectionRow>
		}
		{
			!active ?
				Object.values(modules).filter(m => m.isValid).map(m => {
					let apps = m.apps;
					let hasData = apps.filter(a => m.hasData(a));

					return <PanelSectionRow key={m.identifier}>
						<Field
							label={m.title}
							description={`${hasData.length}/${apps.length}`}
							childrenLayout="below"
							onActivate={() => {
								setActive(m.identifier);
								activeModule = m.identifier;
							}}>
							<ProgressBar
								focusable={false}
								nProgress={(hasData.length / apps.length * 100)}
							/>
						</Field>
					</PanelSectionRow>;
				}) :
				modules[active].apps.filter(a => modules[active].hasData(a)).map(a => {
					let data = modules[active].fetchData(a);
					let provider = modules[active].dataProviders[a];

					if(data){
						return <PanelSectionRow key={a}>
							<Field
								label={appStore.GetAppOverviewByAppID(a).display_name}
								description={(
									(provider ? provider + " - " : "") +
									truncate(modules[active].progressDescription(data), {
										'length': 100,
										'omission': "..."
									})
								)}
								onActivate={() => {
									Navigation.CloseSideMenus();
									Navigation.Navigate(`/metadeck/${modules[active].identifier}`);
								}}>
							</Field>
						</PanelSectionRow>;
					}
					else
						return undefined;
				})
		}
	</>
};

export const MetaDeckComponent: FC = () => {
	const { loadingData } = useMetaDeckState();

	return (
		<PanelSection>
			<PanelSectionRow>
				<SettingsButton />
			</PanelSectionRow>
			{
				(!loadingData.loading) &&
				<>
					<PanelSectionRow>
						<RefreshButton />
					</PanelSectionRow>
					<PanelSectionRow>
						<CacheButton />
					</PanelSectionRow>
				</>
			}
			{
				(loadingData.loading || loadingData.currentModule?.error) &&
				<PanelSectionRow>
					<LoadingProgressBar />
				</PanelSectionRow>
			}
			{
				(!loadingData.loading) &&
				<PanelSectionRow>

					<ModulesList />
					
				</PanelSectionRow>
			}
		</PanelSection>
	);
};