// AirROI API response types — matches API v2.0.7

export interface AirROIListingInfo {
  listing_id: number;
  listing_name: string;
  listing_type: string;
  room_type: string;
  cover_photo_url: string;
  photos_count: number;
}

export interface AirROIHostInfo {
  host_id: number;
  host_name: string;
  superhost: boolean;
  professional_management: boolean;
}

export interface AirROILocationInfo {
  country_code: string;
  country: string;
  region: string;
  locality: string;
  district: string;
  latitude: number;
  longitude: number;
}

export interface AirROIPropertyDetails {
  guests: number;
  bedrooms: number;
  beds: number;
  baths: number;
  amenities: string[];
}

export interface AirROIPerformanceMetrics {
  ttm_revenue: number;
  ttm_avg_rate: number;
  ttm_occupancy: number;
  ttm_revpar: number;
  ttm_total_days: number;
  ttm_available_days: number;
  ttm_blocked_days: number;
  ttm_days_reserved: number;
  l90d_revenue: number;
  l90d_avg_rate: number;
  l90d_occupancy: number;
  l90d_revpar: number;
  l90d_total_days: number;
  l90d_available_days: number;
  l90d_blocked_days: number;
  l90d_days_reserved: number;
}

export interface AirROIListing {
  listing_info: AirROIListingInfo;
  host_info: AirROIHostInfo;
  location_info: AirROILocationInfo;
  property_details: AirROIPropertyDetails;
  booking_settings: { instant_book: boolean; min_nights: number; cancellation_policy: string };
  pricing_info: { currency: string; cleaning_fee: number; extra_guest_fee: number };
  ratings: { num_reviews: number; rating_overall: number };
  performance_metrics: AirROIPerformanceMetrics;
}

export interface AirROIPercentiles {
  avg: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface AirROIMarketMetricEntry {
  date: string;
  occupancy: AirROIPercentiles;
  average_daily_rate: AirROIPercentiles;
  revpar: AirROIPercentiles;
  revenue: AirROIPercentiles;
  booking_lead_time: AirROIPercentiles;
  length_of_stay: AirROIPercentiles;
  active_listings_count: number;
}

export interface AirROIMarketSummary {
  market: AirROIMarketRef;
  occupancy: number;
  average_daily_rate: number;
  rev_par: number;
  revenue: number;
  booking_lead_time: number;
  length_of_stay: number;
  active_listings_count: number;
}

export interface AirROIMarketRef {
  country: string;
  region: string;
  locality: string;
  district?: string;
}

export interface AirROIMarketLookup {
  full_name: string;
  country: string;
  region: string;
  locality: string;
  district: string;
}

export interface AirROIListingMetricEntry {
  date: string;
  occupancy: number;
  average_daily_rate: number;
  rev_par: number;
  revenue: number;
}

export interface AirROISearchResult {
  pagination: { total_count: number; page_size: number; offset: number };
  results: AirROIListing[];
}

export interface AirROIComparablesResult {
  listings: AirROIListing[];
}

export interface AirROICalculatorEstimate {
  location: { latitude: number; longitude: number };
  revenue: number;
  average_daily_rate: number;
  occupancy: number;
  percentiles: {
    revenue: AirROIPercentiles;
    average_daily_rate: AirROIPercentiles;
    occupancy: AirROIPercentiles;
  };
  currency: string;
  comparable_listings: AirROIListing[];
}
