# Inventory Management System (Vercel + Supabase)

This is a lightweight inventory/dispatch/inward system built for:
- Inventory (Add/Search/Edit/Delete/View Stock)
- Dispatch (Stock OUT with Customer + Challan + Qty + Date)
- Dispatch History (full table with filters)
- Inward (Stock IN with Type + Qty + Date)
- Inward History (full table with filters)
- Customer History (select customer, date range or all time + export CSV)
- Masters (Categories, Components, Colors, Customers)

Login is basic email/password using **Supabase Auth**.

## Roles (Owner vs Staff)

- **Owner**: can access everything (Inventory, Masters, History, Customer History, Users).
- **Staff**: can only enter **Dispatch** and **Inward**.

To keep it safe, staff cannot edit item/masters or delete anything. Stock updates for Dispatch/Inward are done server-side (atomic) via Supabase SQL functions.

## 1) Create Supabase project + tables

1. Create a new project in Supabase.
2. Go to **SQL Editor** → run `supabase_schema.sql` (included in this repo).
3. Go to **Authentication → Providers** and enable **Email**.
   - For a very basic setup, you can disable email confirmation: Auth → Settings → Email confirmations.

### Auth redirect URLs (important)
In Supabase: **Authentication → URL Configuration**
- Site URL:
  - Local dev: `http://localhost:3000`
  - After deploy: set it to your Vercel domain (example: `https://yourapp.vercel.app`)
- Redirect URLs:
  - Add `http://localhost:3000/**`
  - Add `https://yourapp.vercel.app/**`

## 2) Run locally

```bash
npm install
cp .env.local.example .env.local
# edit .env.local with Supabase URL + anon key
npm run dev
```

Open: http://localhost:3000

## 3) Deploy to Vercel

**Option A (recommended): GitHub → Vercel**
1. Push this project to a GitHub repo.
2. In Vercel, click **Add New → Project** and import the repo.
3. Add these Environment Variables in Vercel (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy.

**Option B: Vercel CLI**
```bash
npm i -g vercel
vercel
```

### Set your first Owner

1. Sign up in the app with your main email.
2. In Supabase SQL Editor, run:

```sql
update public.profiles
set role = 'owner'
where email = 'YOUR_EMAIL_HERE';
```

After that, you can use the **Users** tab inside the app to promote other accounts to owner/staff.

## Notes / Design decisions

- Stock is stored in **pieces** in the `items.stock_pieces` column.
- Bags are calculated as `pieces / pieces_per_bag` (and shown as bags + leftover pieces).
- RLS is configured as role-based:
  - Authenticated users can **read** Items + Masters (needed for dropdowns).
  - Only **Owner** can manage Inventory/Masters and view full history.
  - Staff can only create Dispatch/Inward using RPCs that update stock atomically.
  - Deleting in the UI requires entering username + password.

## Common next upgrades (tell me which ones you want)
- Printable challan / invoice template (PDF)
- Bulk import items from Excel
- Daily stock movement reports (date-wise IN/OUT)
- Multi-factory/branches (multi-tenant)
