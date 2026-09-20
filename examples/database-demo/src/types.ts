export interface Customer {
  name: string;
  email: string;
  phone: string;
  tier?: "Standard" | "Premium" | "Enterprise";
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerRecord {
  recordId: string;
  sha: string;
  data: Customer;
}

export interface ApiAlert {
  type: "success" | "error" | "info" | "warning";
  title: string;
  message: string;
  status?: number;
}
