# Linen Theme — Template Reference

All templates use [Handlebars](https://handlebarsjs.com/) syntax. Every page receives the **global context** automatically. Page-specific variables are listed per template.

---

## Global context (every template)

These are available on every page.

### Store

| Variable | Example output | Notes |
|---|---|---|
| `{{store.name}}` | `My Store` | Set in Admin → Settings |
| `{{store.url}}` | `https://mystore.com` | Set in Admin → Settings |
| `{{store.currency.code}}` | `GBP` | Set in Admin → Settings |
| `{{store.currency.symbol}}` | `£` | Derived from currency code |
| `{{store.logo}}` | `/uploads/logo.png` | `null` if not set |

### Cart

| Variable | Example output | Notes |
|---|---|---|
| `{{cart.itemCount}}` | `3` | Total items across all lines |
| `{{money cart.subtotal}}` | `£29.99` | Use `money` helper to format |

### Navigation

```hbs
{{#each navigation.main}}
  <a href="{{this.url}}" class="{{#if this.active}}active{{/if}}">{{this.label}}</a>
{{/each}}

{{#each navigation.footer}}
  <a href="{{this.url}}">{{this.label}}</a>
{{/each}}
```

### Customer

```hbs
{{#if customer.loggedIn}}
  Hello, {{customer.firstName}}
{{/if}}
```

### Theme config

Values set in Admin → Themes → Customise.

```hbs
{{theme.config.colors.primary}}       {{! e.g. #1A1A2E }}
{{theme.config.colors.accent}}        {{! e.g. #E94560 }}
{{theme.config.colors.background}}    {{! e.g. #FFFFFF }}
{{theme.config.typography.headingFont}}
{{theme.config.layout.productsPerRow}}
{{theme.config.layout.showHero}}
{{theme.config.layout.heroHeading}}
{{theme.config.layout.heroImage}}
{{theme.config.layout.featuredCollection}}
```

> Colors are also available as CSS custom properties — prefer those over outputting raw hex values:
> ```css
> var(--color-primary)
> var(--color-accent)
> var(--color-background)
> var(--font-heading)
> ```

### Meta

| Variable | Notes |
|---|---|
| `{{currentPath}}` | Current URL path, e.g. `/products/my-watch` |
| `{{pageTitle}}` | Page-level title (set per route) |
| `{{metaDescription}}` | Page-level meta description |

---

## Partials

Register a `.hbs` file in `partials/` and include it anywhere:

```hbs
{{> header}}
{{> footer}}
{{> product-card}}      {{! receives current loop context }}
{{> pagination}}
{{> cart-contents}}
```

---

## Templates and their page-specific variables

### `index.hbs` — Homepage

| Variable | Type | Notes |
|---|---|---|
| `showHero` | boolean | From theme config `layout.showHero` |
| `heroHeading` | string | From theme config `layout.heroHeading` |
| `heroSubheading` | string | Set in the route (static for now) |
| `featuredProducts` | ProductSummary[] | All published products |

```hbs
{{#if showHero}}
  <h1>{{heroHeading}}</h1>
{{/if}}

{{#each featuredProducts}}
  {{> product-card}}
{{/each}}
```

---

### `product.hbs` — Product page

| Variable | Type | Notes |
|---|---|---|
| `product.title` | string | |
| `product.slug` | string | |
| `product.description` | string | HTML — use triple-stash `{{{product.description}}}` |
| `product.price` | Money | Use `{{money product.price}}` |
| `product.compareAtPrice` | Money \| null | |
| `product.onSale` | boolean | `true` when `compareAtPrice` is set and lower |
| `product.available` | boolean | `false` when all variants are out of stock |
| `product.images` | Image[] | |
| `product.images.0.large` | string | URL to first image, large size |
| `product.images.0.thumbnail` | string | URL to first image, 100×100 |
| `product.variants` | Variant[] | |
| `product.variants.0.id` | string | Used as `variantId` in add-to-cart form |
| `product.vendor` | string \| null | |
| `product.tags` | string[] | |
| `product.relatedProducts` | ProductSummary[] | Up to 4 related products |

**Image object:**
```hbs
{{product.images.0.original}}    {{! full resolution }}
{{product.images.0.large}}       {{! 1200px }}
{{product.images.0.medium}}      {{! 600px }}
{{product.images.0.thumbnail}}   {{! 100px }}
{{product.images.0.alt}}
```

**Variant object:**
```hbs
{{#each product.variants}}
  {{this.id}}
  {{this.title}}
  {{money this.price}}
  {{this.available}}
  {{this.sku}}
{{/each}}
```

**Add to cart (htmx):**
```hbs
<form hx-post="/cart/add" hx-target="#cart-count" hx-swap="outerHTML">
  {{csrf_field}}
  <input type="hidden" name="variantId" value="{{product.variants.0.id}}">
  <input type="number" name="quantity" value="1" min="1">
  <button type="submit">Add to Cart</button>
</form>
```

---

### `collection.hbs` — Collection page

| Variable | Type | Notes |
|---|---|---|
| `collection.title` | string | |
| `collection.slug` | string | |
| `collection.description` | string \| null | |
| `collection.products` | ProductSummary[] | |
| `collection.pagination.hasNext` | boolean | |
| `collection.pagination.hasPrev` | boolean | |
| `collection.pagination.nextUrl` | string \| null | |
| `collection.pagination.prevUrl` | string \| null | |
| `collection.sort.current` | string | e.g. `featured`, `price-asc` |
| `collection.sort.options` | `{value, label}[]` | For building a sort dropdown |

```hbs
{{#each collection.products}}
  {{> product-card}}
{{/each}}

{{pagination collection.pagination}}
```

---

### `cart.hbs` — Cart page

| Variable | Type | Notes |
|---|---|---|
| `cart.empty` | boolean | |
| `cart.items` | CartItem[] | |
| `cart.itemCount` | number | |
| `cart.subtotal` | Money | |
| `cart.discountCode` | string \| null | |
| `cart.discountAmount` | Money \| null | |
| `cart.total` | Money | |
| `cart.checkoutUrl` | string | `/checkout` |

**Cart item:**
```hbs
{{#each cart.items}}
  {{this.productTitle}}
  {{this.variantTitle}}
  {{this.quantity}}
  {{money this.lineTotal}}
  {{this.image.thumbnail}}
  {{this.productSlug}}   {{! for linking back to the product }}
  {{this.id}}            {{! used in update/remove operations }}
{{/each}}
```

**Update quantity (htmx):**
```hbs
<input type="number" value="{{this.quantity}}"
  hx-post="/cart/update"
  hx-target="#cart-contents"
  hx-swap="outerHTML"
  hx-vals='{"itemId": "{{this.id}}"}'
  hx-trigger="change"
  name="quantity">
```

**Remove item (htmx):**
```hbs
<button hx-delete="/cart/remove/{{this.id}}"
        hx-target="#cart-contents"
        hx-swap="outerHTML">
  Remove
</button>
```

---

### `search.hbs` — Search page

| Variable | Type | Notes |
|---|---|---|
| `query` | string | The search term from `?q=` |
| `products` | ProductSummary[] | Matching products (empty array until Phase 6 FTS) |

---

### `page.hbs` — Static pages

| Variable | Type | Notes |
|---|---|---|
| `page.title` | string | |
| `page.slug` | string | |
| `page.content` | string | HTML — use `{{{page.content}}}` |

---

### `404.hbs` — Not found

No page-specific variables beyond the global context.

---

## Helpers

### `{{money value}}`
Formats a Money object using the store currency.
```hbs
{{money product.price}}          {{! → £29.99 }}
{{money cart.subtotal}}
```

### `{{asset "filename"}}`
Returns the content-hashed URL for a theme asset. Always use this instead of a raw path.
```hbs
<link rel="stylesheet" href="{{asset 'style.css'}}">
<img src="{{asset 'images/logo.png'}}">
```

### `{{url type slug}}`
Generates a store URL.
```hbs
{{url 'product' product.slug}}       {{! → /products/my-watch }}
{{url 'collection' 'all'}}           {{! → /collections/all }}
{{url 'cart'}}                       {{! → /cart }}
{{url 'search'}}                     {{! → /search }}
{{url 'page' 'about'}}               {{! → /pages/about }}
```

### `{{csrf_field}}`
Outputs the hidden CSRF input. Required in every mutating form.
```hbs
<form method="POST" action="/cart/add">
  {{csrf_field}}
  ...
</form>
```

### `{{meta_title}}` · `{{meta_description}}` · `{{canonical_url}}`
Output full `<title>`, `<meta>`, and `<link>` tags. Use in `<head>`.
```hbs
<head>
  {{meta_title}}
  {{meta_description}}
  {{canonical_url}}
</head>
```

### `{{#if (gt a b)}}` / `{{#if (lt a b)}}`
Numeric comparisons.
```hbs
{{#if (gt product.images.length 1)}}
  ...show thumbnails...
{{/if}}
```

### `{{#is a b}}...{{else}}...{{/is}}`
Strict equality block. Also works as a subexpression.
```hbs
{{#is product.vendor "ACME"}}Special brand{{else}}Other{{/is}}

{{#unless (is this.variantTitle "Default")}}
  {{this.variantTitle}}
{{/unless}}
```

### `{{truncate text length}}`
Trims text to `length` characters and appends `…`.
```hbs
{{truncate product.description 120}}
```

### `{{pluralize count singular plural}}`
```hbs
{{pluralize cart.itemCount "item" "items"}}   {{! → "3 items" }}
```

### `{{timestamp dateString}}`
Formats a date string as `01 Jan 2025`.
```hbs
{{timestamp order.created_at}}
```

### `{{t "key"}}`
Translation stub — returns the key as-is until Phase 6.
```hbs
{{t "cart.empty"}}
```

---

## CSS custom properties

These are injected into every page's `<head>` from the active theme's config. Use them in your CSS instead of hardcoded values so the customiser takes effect.

```css
var(--color-primary)      /* theme.config.colors.primary */
var(--color-accent)       /* theme.config.colors.accent */
var(--color-background)   /* theme.config.colors.background */
var(--font-heading)       /* theme.config.typography.headingFont */
```

---

## htmx patterns

The cart uses htmx for fragment swaps. The key targets are:

| Element ID | Updated by |
|---|---|
| `#cart-count` | Add to cart (`hx-target="#cart-count"`) |
| `#cart-contents` | Update quantity, remove item (`hx-target="#cart-contents"`) |

All cart mutation routes check for the `HX-Request` header and return either an HTML fragment (htmx) or a redirect (plain form submission).
