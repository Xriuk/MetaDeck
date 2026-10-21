import {useState} from "react";
import languages from "./translations";
import type { DropdownOption } from "@decky/ui";

type LocalizationLanguage = keyof typeof languages;
export type Language = LocalizationLanguage | "ar" | "id" | "ms";

export function getCurrentLanguage(): LocalizationLanguage {
	const steamLang = window.LocalizationManager.m_rgLocalesToUse[0]
	const lang = steamLang.replace(
		/-([a-z])/g,
		(_, letter: string) => letter.toUpperCase()) as LocalizationLanguage;
	return isValidLanguage(lang) ? lang : 'en';
}

export function isValidLanguage(code: string): code is Language{
	return !!(languages as any)[code];
}

export function useTranslations() {
	const [lang] = useState(getCurrentLanguage());
	return function (key: keyof (typeof languages)['en']): string {
		// @ts-ignore
		if (languages[lang]?.[key]?.length) {
			// @ts-ignore
			return languages[lang]?.[key];
		}
		else if (languages.en?.[key]?.length) 
			return languages.en?.[key];
		else 
			return key;
	}
}

export function t(key: keyof (typeof languages)['en']): string {
	let lang = getCurrentLanguage();
	// if (!(key in languages[lang]))
	// {
	// 	lang = "en"
	// }
	// @ts-ignore
	if (languages[lang]?.[key]?.length) {
		// @ts-ignore
		return languages[lang]?.[key];
	}
	else if (languages.en?.[key]?.length)
		return languages.en?.[key];
	else 
		return key;
}

export function getLanguageTitle(code: Language, original = true){
	const languageNames: Record<Language, {
		localized: string;
		original: string;
	}> = {
		ar: {
			localized: t("languageArabic"),
			original: 'العربية'
		},
		bg: {
			localized: t("languageBulgarian"),
			original: 'Български'
		},
		cs: {
			localized: t("languageCzech"),
			original: 'Čeština'
		},
		da: {
			localized: t("languageDanish"),
			original: 'Dansk'
		},
		de: {
			localized: t("languageGerman"),
			original: 'Deutsch'
		},
		el: {
			localized: t("languageGreek"),
			original: 'Ελληνικά'
		},
		en: {
			localized: t("languageEnglish"),
			original: 'English'
		},
		es: {
			localized: t("languageSpanishSpain"),
			original: 'Español (España)'
		},
		es419: {
			localized: t("languageSpanishLatinAmerica"),
			original: 'Español (América Latina)'
		},
		fi: {
			localized: t("languageFinnish"),
			original: 'Suomi'
		},
		fr: {
			localized: t("languageFrench"),
			original: 'Français'
		},
		hu: {
			localized: t("languageHungarian"),
			original: 'Magyar'
		},
		id: {
			localized: t("languageIndonesian"),
			original: 'Bahasa Indonesia'
		},
		it: {
			localized: t("languageItalian"),
			original: 'Italiano'
		},
		ja: {
			localized: t("languageJapanese"),
			original: '日本語'
		},
		ko: {
			localized: t("languageKorean"),
			original: '한국어'
		},
		ms: {
			localized: t("languageMalay"),
			original: 'Bahasa Melayu'
		},
		nl: {
			localized: t("languageDutch"),
			original: 'Nederlands'
		},
		no: {
			localized: t("languageNorwegian"),
			original: 'Norsk'
		},
		pl: {
			localized: t("languagePolish"),
			original: 'Polski'
		},
		pt: {
			localized: t("languagePortuguesePortugal"),
			original: 'Português (Portugal)'
		},
		ptBr: {
			localized: t("languagePortugueseBrazil"),
			original: 'Português (Brasil)'
		},
		ro: {
			localized: t("languageRomanian"),
			original: 'Română'
		},
		ru: {
			localized: t("languageRussian"),
			original: 'Русский'
		},
		sv: {
			localized: t("languageSwedish"),
			original: 'Svenska'
		},
		th: {
			localized: t("languageThai"),
			original: 'ไทย'
		},
		tr: {
			localized: t("languageTurkish"),
			original: 'Türkçe'
		},
		uk: {
			localized: t("languageUkrainian"),
			original: 'Українська'
		},
		vi: {
			localized: t("languageVietnamese"),
			original: 'Tiếng Việt'
		},
		zhCn: {
			localized: t("languageChineseSimplified"),
			original: '汉语'
		},
		zhTw: {
			localized: t("languageChineseTraditional"),
			original: '漢語'
		}
	};

	const currentLanguage = getCurrentLanguage();

	return languageNames[code].localized +
		(original && code !== currentLanguage ? " - " + languageNames[code].original : "");
}

export function getAutoLanguageOptions(defaultLanguageTitle: string): DropdownOption[]{
	return [{
		data: null,
		label: t("languageAuto")
			.replace("{language}", defaultLanguageTitle)
	}];
}