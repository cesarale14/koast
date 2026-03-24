export interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  imageUrl: string | null;
  roomCount: number;
  activeBookings: number;
  occupancyRate: number;
  channexLinked: boolean;
}

export interface PropertyStats {
  totalRevenue: number;
  averageRate: number;
  occupancyRate: number;
  totalBookings: number;
  period: "week" | "month" | "year";
}
