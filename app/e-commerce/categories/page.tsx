'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/ecommerce/Navigation';
import GlobalCategorySidebar from '@/components/ecommerce/category/GlobalCategorySidebar';
import catalogService, { CatalogCategory } from '@/services/catalogService';
export default function CategoriesPage() { const [categories,setCategories]=useState<CatalogCategory[]>([]); const [open,setOpen]=useState(true); const router=useRouter(); useEffect(()=>{catalogService.getCategories().then(setCategories)},[]); return <main className="ref-storefront ref-categories-page"><Navigation/><section><h1>EXPLORE CATEGORIES</h1><button onClick={()=>setOpen(true)}>OPEN CATEGORY INDEX</button><button onClick={()=>router.push('/e-commerce/products')}>SHOP ALL PRODUCTS</button></section><GlobalCategorySidebar categories={categories} isOpen={open} onClose={()=>setOpen(false)}/></main>; }
