import {useMetaDeckState} from "./MetaDeckState";
import {FC, useEffect, useState, type CSSProperties} from "react";
import {useTranslations} from "./useTranslations";
import {ButtonItem, PanelSection, PanelSectionRow, Navigation, Field, ProgressBar} from "@decky/ui";
import {FaCog, FaSync, FaTrash} from "react-icons/fa";
import React from "react";

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
			description={`${loadingData.currentModule?.module.title} - ${loadingData.processed}/${loadingData.total}`}
			bottomSeparator="none"
		/>
		<ProgressBar
			focusable={false}
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

export const MetaDeckComponent: FC = () => {
	const { loadingData } = useMetaDeckState();

	return (
		loadingData.loading ?
			<PanelSection>
				<PanelSectionRow>
					<SettingsButton />
				</PanelSectionRow>
				<PanelSectionRow>
					<LoadingProgressBar />
				</PanelSectionRow>
			</PanelSection> : (loadingData.currentModule.error ?
				<PanelSection>
					<PanelSectionRow>
						<SettingsButton />
					</PanelSectionRow>
					<PanelSectionRow>
						<RefreshButton />
					</PanelSectionRow>
					<PanelSectionRow>
						<CacheButton />
					</PanelSectionRow>
					<PanelSectionRow>
						<LoadingProgressBar />
					</PanelSectionRow>
				</PanelSection> :
				<PanelSection>
					<PanelSectionRow>
						<SettingsButton />
					</PanelSectionRow>
					<PanelSectionRow>
						<RefreshButton />
					</PanelSectionRow>
					<PanelSectionRow>
						<CacheButton />
					</PanelSectionRow>
				</PanelSection>)
	);
};