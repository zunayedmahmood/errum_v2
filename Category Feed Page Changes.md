# Category Feed Page Changes

This document details the refined functionality of the **Category Feed** page (`/e-commerce/[slug]`), focusing on the architectural changes made to support premium product cards and strictly in-stock filtering.

## 1. Core Architecture: The "Slug" Based Feed
The page identifies the relevant collection by extracting the `slug` from the URL. 

- **Dynamic Normalization**: The slug is normalized (e.g., `men-shoes` becomes `men shoes`) to match either the `slug` or the `name` field of categories in the database.
- **Hierarchical Matching**: When a parent category is selected, the page automatically includes all products belonging to its children and descendants.

## 2. Transition to `PremiumProductCard`
The legacy product grid has been replaced with the high-performance `PremiumProductCard`.

- **Visual Consistency**: The category page now shares the same "Curated Excellence" design language as the main product feed, including glassmorphism and gold accents.
- **Enhanced Interaction**: Users can now toggle **Wishlist** status directly from the category grid, and the card correctly displays the "X options" badge for grouped product variations.

## 3. Strict In-Stock Filtering
A major change has been implemented to hide unavailable products from the category view.

- **Backend Enforcement**: The `EcommerceCatalogController` now defaults the `in_stock` parameter to `true`. This ensures that out-of-stock items are filtered at the database level before reaching the frontend.
- **UI Simplification**: The "Availability" filter has been removed from the sidebar since the view is now exclusive to available items, reducing cognitive load for the customer.

## 4. Intelligent Grouping and "Filling" Logic
Because one "Product" in the feed might actually represent dozens of variations (sizes/colors), the frontend uses a sophisticated grouping algorithm:

- **Representative Selection**: The system automatically picks the most relevant variant (usually the one with stock and the lowest price) to act as the "Mother" product for the group.
- **Gap Filling**: If grouping reduces the number of items below the threshold (20 per page), the page silently fetches additional API pages until the requirement is met or the collection is exhausted. This prevents "half-empty" pages when multiple variations of the same item appear sequentially in the database.

## 5. Edge Cases and Technical Details

- **Deep Link Navigation**: If a user bookmarks a specific category, the system uses the `slugFallback` mechanism to ensure the correct products are loaded even if the category tree hasn't finished fetching from the server.
- **Image Propagation**: If some variants lack images but their siblings have them, the system "propagates" those images across the group so that every product card maintains a premium visual state.
- **Empty Categories**: If a collection contains no in-stock items, a dedicated "Empty State" UI is shown, guiding users back to the main shop or other collections.
- **Sorting Bias**: Category feeds are hardcoded to show the "Newest" items first to ensure returning customers always see fresh arrivals.
