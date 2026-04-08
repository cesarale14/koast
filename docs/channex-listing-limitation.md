# Channex API Limitation: No Unmapped Listing Discovery

**Date:** 2026-04-08

## Finding

The Channex API does NOT expose unmapped OTA listings. After connecting an Airbnb account via OAuth, only listings that are already mapped to a Channex property appear in the API response (in the channel's `rate_plans` array).

The Channex iframe mapping UI can show all 4 Airbnb listings because it uses an internal authentication flow with the Airbnb access token stored in `settings.tokens`. This flow is not available via the public API.

## Endpoints Tested (All 404)
- GET /channels/{id}/listings
- GET /channels/{id}/mapping
- GET /channel_listings
- GET /mapping_details
- GET /channel_mappings
- GET /ota_listings
- GET /connected_listings

## What IS Available
- Channel's `rate_plans[]` array contains mapped listings (listing_id, listing_type, daily_price)
- Channel's `settings.tokens` contains the Airbnb access_token and user_id
- Channel's `settings.mappingSettings.rooms` — empty object (no data)

## Workaround Implemented

**Two-step flow:**
1. **Auto-scaffold:** Before opening the iframe, create N Channex properties with default room types and rate plans (one per listing we want to import)
2. **Iframe mapping:** Open the Channex iframe at group level. The iframe shows ALL Airbnb listings and ALL Channex properties. User maps each listing to a property.
3. **Post-mapping import:** After iframe closes, query the API for newly mapped listings and import them into StayCommand.

**For the first connection (no properties yet):**
- We can't know how many listings the user has until they see the iframe
- Create one scaffold property, let them map one listing, then offer "Add more"

**Future possibility:**
- Contact Channex support about a listing discovery API for whitelabel accounts
- Or scrape the Airbnb API using the stored access_token (risky, against Airbnb TOS)
