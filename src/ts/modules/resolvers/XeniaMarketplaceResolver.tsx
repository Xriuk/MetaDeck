import { fetchNoCors } from "@decky/api";
import type { ID } from "../../Interfaces";
import type { ResolverConfig } from "../Resolver";
import { XeniaResolver, type XeniaResolverCache } from "./XeniaResolver";

export type DBoxMarketplaceProductsResponse = {
	items: {
		product_id: string;
		default_title: string;
	}[]
};

export interface XeniaMarketplaceResolverConfig extends ResolverConfig{
	
}

export interface XeniaMarketplaceResolverCache extends XeniaResolverCache{
	product_ids: Record<number, string | null>;
}

// Returns product id (eg: 66acd000-77fe-1000-9115-d802545107d1)
export class XeniaMarketplaceResolver extends XeniaResolver{
	identifier = "xenia_marketplace" as const;

	get productIds(): Record<number, string | null>{
		return this.cache.product_ids;
	}

	override async resolve(appId: number): Promise<ID | undefined> {
		let productId: string | null | undefined = this.productIds[appId];
		if(productId !== undefined)
			return productId ?? undefined;

		let titleId = (await super.resolve(appId))?.toString();
		if(!titleId)
			return undefined;

		let response = await fetchNoCors('https://dbox.tools/api/marketplace/products/?' + new URLSearchParams({
			product_type: (1).toString(),
			title_id: titleId,
			limit: (1).toString()
		}).toString());
		if(!response.ok){
			this.productIds[appId] = null;
			return undefined;
		}

		let res: DBoxMarketplaceProductsResponse = await response.json();
		productId = res.items[0]?.product_id ?? null;

		this.productIds[appId] = productId;

		return productId ?? undefined;
	}
}