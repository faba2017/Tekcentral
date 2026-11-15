import { useEffect, useState } from "react";
import { apiRequest } from "./api";
import type { Product } from "@/types/product";
export interface PublicHomepageSection { key:string;type:"PRODUCT_LIST"|"CATEGORY_LIST";title:string;subtitle:string;products?:Product[];categories?:{id:string;slug:string;label:string;description:string;subcategories:string[]}[] }
export function useHomepageMerchandising(){const [data,setData]=useState<{sections:PublicHomepageSection[]}>();useEffect(()=>{let active=true;void apiRequest<{sections:PublicHomepageSection[]}>("/api/public/merchandising/homepage").then((value)=>{if(active)setData(value)}).catch(()=>undefined);return()=>{active=false};},[]);return data;}
