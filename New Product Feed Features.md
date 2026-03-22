# New Product Feed Features

This document details the features and functionality of the refined **Product Feed** page (`/e-commerce/products`), which has been redesigned for premium aesthetics and high-performance filtering.

## 1. Advanced Search Capabilities
The search system has been significantly enhanced on both frontend and backend.

- **Frontend Behavior**: The search bar now triggers searches automatically as you type, using a **500ms debounce** to maintain performance while providing instant feedback.
- **Backend Search Scope**: The search now matches across:
  - **Product Name** & **Base Name**
  - **SKU**
  - **Category** & **Subcategories**
  - **Attributes** (specifically **Color** and **Size** stored in product fields or variant suffixes).
- **URL Synchronization**: Search queries are synced with the `?search=` URL parameter, allowing for easy sharing and browser history navigation.

## 2. Dynamic Price Range Filtering
A new **Price Range Selector** component has been integrated into the sidebar.

- **Standard Ranges**:
  - Under ৳500
  - ৳500 - ৳1,000
  - ৳1,000 - ৳2,000
  - ৳2,000 - ৳5,000
  - Above ৳5,000
- **Efficient Backend Execution**: Filtering is performed at the database level on product batches, ensuring only available, in-stock variants are considered for the price calculation.

## 3. Intelligent SKU Grouping & Sorting
To improve the browsing experience, products are grouped by their `base_name` (SKU grouping).

- **Correct Price Sorting**: The "Price: Low to High" and "Price: High to Low" options correctly sort the *groups* based on the minimum price available within that group.
- **Recursive Categories**: The category filter now automatically includes all products from subcategories of the selected category.
- **Main Variant Selection**: The system automatically selects the lowest-priced available variant to represent the group in the feed.

## 4. Wishlist Integration
Every product card now features a fully functional **Wishlist** button.

- **Persistent State**: Items added to the wishlist are saved locally and synced across the application.
- **Visual Feedback**: The heart icon provides immediate visual feedback (gold fill) when an item is in the wishlist.
- **Global Sync**: Using a custom `wishlist-updated` event, adding an item to the wishlist in one card immediately updates the state of all other cards for the same product on the page.

## 5. Responsive Design & "Non-Sticky" Mobile UI
The interface adapts to the device's viewport size to optimize the user journey.

- **Desktop Layout**: Features a persistent sidebar for categories and price ranges, with a sticky container to keep filters accessible during scrolling.
- **Mobile Layout**: 
  - The horizontal filter bar and search remain at the top but are **not sticky**, preventing them from consuming limited screen space during vertical scrolling.
  - A dedicated **Mobile Filter Modal** provides a clean, focused interface for selecting categories, price ranges, and sorting options on small screens.

---

## Edge Cases and Technical Details

- **Out of Stock Groups**: If all variants in a group are out of stock, the group will still appear if the "in_stock" filter is not set to true, but the card will display an "Out of Stock" label.
- **No Results State**: A premium "Empty State" UI is provided with a "Reset All Filters" button to help users recover from zero-result queries.
- **Variant Counting**: The product cards accurately display "X options" based on the number of unique product IDs sharing the same `base_name`.
- **Image Fallbacks**: If a product has no valid images or the images fail to load, a premium placeholder is used to maintain the grid's visual integrity.
