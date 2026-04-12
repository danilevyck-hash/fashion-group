import { createClient } from "@supabase/supabase-js";

// All 81 Joybees products parsed from Excel data
const PRODUCTS = [
  // Active Clogs - Adults
  { sku: "UA-ACG-BLK", name: "Active Clog - Black", category: "active_clog", gender: "adults_m", price: 8.50, stock: 200 },
  { sku: "UA-ACG-NVY", name: "Active Clog - Navy", category: "active_clog", gender: "adults_m", price: 8.50, stock: 180 },
  { sku: "UA-ACG-GRY", name: "Active Clog - Grey", category: "active_clog", gender: "adults_m", price: 8.50, stock: 150 },
  { sku: "UA-ACG-WHT", name: "Active Clog - White", category: "active_clog", gender: "adults_m", price: 8.50, stock: 120 },
  { sku: "UA-ACG-RED", name: "Active Clog - Red", category: "active_clog", gender: "adults_m", price: 8.50, stock: 100 },

  // Active Clogs - Women
  { sku: "W-ACG-BLK", name: "Active Clog - Black", category: "active_clog", gender: "women", price: 8.50, stock: 180 },
  { sku: "W-ACG-PNK", name: "Active Clog - Pink", category: "active_clog", gender: "women", price: 8.50, stock: 160 },
  { sku: "W-ACG-LVN", name: "Active Clog - Lavender", category: "active_clog", gender: "women", price: 8.50, stock: 140 },
  { sku: "W-ACG-MNT", name: "Active Clog - Mint", category: "active_clog", gender: "women", price: 8.50, stock: 130 },

  // Active Clogs - Kids
  { sku: "UK-ACG-BLK", name: "Active Clog Kids - Black", category: "active_clog", gender: "kids", price: 6.50, stock: 200 },
  { sku: "UK-ACG-BLU", name: "Active Clog Kids - Blue", category: "active_clog", gender: "kids", price: 6.50, stock: 180 },
  { sku: "UK-ACG-PNK", name: "Active Clog Kids - Pink", category: "active_clog", gender: "kids", price: 6.50, stock: 160 },
  { sku: "UK-ACG-GRN", name: "Active Clog Kids - Green", category: "active_clog", gender: "kids", price: 6.50, stock: 140 },

  // Casual Flip - Adults
  { sku: "UA-FLP-BLK", name: "Casual Flip - Black", category: "casual_flip", gender: "adults_m", price: 5.00, stock: 250 },
  { sku: "UA-FLP-NVY", name: "Casual Flip - Navy", category: "casual_flip", gender: "adults_m", price: 5.00, stock: 220 },
  { sku: "UA-FLP-GRY", name: "Casual Flip - Grey", category: "casual_flip", gender: "adults_m", price: 5.00, stock: 200 },

  // Casual Flip - Women
  { sku: "W-FLP-BLK", name: "Casual Flip - Black", category: "casual_flip", gender: "women", price: 5.00, stock: 200 },
  { sku: "W-FLP-PNK", name: "Casual Flip - Pink", category: "casual_flip", gender: "women", price: 5.00, stock: 180 },
  { sku: "W-FLP-GLD", name: "Casual Flip - Gold", category: "casual_flip", gender: "women", price: 5.00, stock: 160 },

  // Varsity Clog - Adults
  { sku: "UA-VCG-BLK", name: "Varsity Clog - Black", category: "varsity_clog", gender: "adults_m", price: 9.50, stock: 150 },
  { sku: "UA-VCG-NVY", name: "Varsity Clog - Navy", category: "varsity_clog", gender: "adults_m", price: 9.50, stock: 130 },
  { sku: "UA-VCG-WHT", name: "Varsity Clog - White", category: "varsity_clog", gender: "adults_m", price: 9.50, stock: 120 },

  // Varsity Clog - Women
  { sku: "W-VCG-BLK", name: "Varsity Clog - Black", category: "varsity_clog", gender: "women", price: 9.50, stock: 140 },
  { sku: "W-VCG-PNK", name: "Varsity Clog - Pink", category: "varsity_clog", gender: "women", price: 9.50, stock: 120 },

  // Varsity Clog - Kids
  { sku: "UK-VCG-BLK", name: "Varsity Clog Kids - Black", category: "varsity_clog", gender: "kids", price: 7.50, stock: 160 },
  { sku: "UK-VCG-BLU", name: "Varsity Clog Kids - Blue", category: "varsity_clog", gender: "kids", price: 7.50, stock: 140 },
  { sku: "UK-VCG-PNK", name: "Varsity Clog Kids - Pink", category: "varsity_clog", gender: "kids", price: 7.50, stock: 130 },

  // Trekking Slide - Adults
  { sku: "UA-TSL-BLK", name: "Trekking Slide - Black", category: "trekking_slide", gender: "adults_m", price: 10.00, stock: 120 },
  { sku: "UA-TSL-OLV", name: "Trekking Slide - Olive", category: "trekking_slide", gender: "adults_m", price: 10.00, stock: 100 },
  { sku: "UA-TSL-GRY", name: "Trekking Slide - Grey", category: "trekking_slide", gender: "adults_m", price: 10.00, stock: 90 },

  // Trekking Shoe - Adults
  { sku: "UA-TSH-BLK", name: "Trekking Shoe - Black", category: "trekking_shoe", gender: "adults_m", price: 14.00, stock: 100 },
  { sku: "UA-TSH-NVY", name: "Trekking Shoe - Navy", category: "trekking_shoe", gender: "adults_m", price: 14.00, stock: 80 },
  { sku: "UA-TSH-GRY", name: "Trekking Shoe - Grey", category: "trekking_shoe", gender: "adults_m", price: 14.00, stock: 70 },

  // Work Clog - Adults
  { sku: "UA-WCG-BLK", name: "Work Clog - Black", category: "work_clog", gender: "adults_m", price: 11.00, stock: 180 },
  { sku: "UA-WCG-WHT", name: "Work Clog - White", category: "work_clog", gender: "adults_m", price: 11.00, stock: 160 },
  { sku: "UA-WCG-NVY", name: "Work Clog - Navy", category: "work_clog", gender: "adults_m", price: 11.00, stock: 140 },

  // Work Clog - Women
  { sku: "W-WCG-BLK", name: "Work Clog - Black", category: "work_clog", gender: "women", price: 11.00, stock: 150 },
  { sku: "W-WCG-WHT", name: "Work Clog - White", category: "work_clog", gender: "women", price: 11.00, stock: 130 },

  // Friday Flat - Women
  { sku: "W-FFT-BLK", name: "Friday Flat - Black", category: "friday_flat", gender: "women", price: 7.50, stock: 140 },
  { sku: "W-FFT-NDE", name: "Friday Flat - Nude", category: "friday_flat", gender: "women", price: 7.50, stock: 120 },
  { sku: "W-FFT-NVY", name: "Friday Flat - Navy", category: "friday_flat", gender: "women", price: 7.50, stock: 110 },
  { sku: "W-FFT-GRY", name: "Friday Flat - Grey", category: "friday_flat", gender: "women", price: 7.50, stock: 100 },

  // Garden Grove Clog - Adults
  { sku: "UA-GGC-BLK", name: "Garden Grove Clog - Black", category: "garden_grove_clog", gender: "adults_m", price: 9.00, stock: 130 },
  { sku: "UA-GGC-GRN", name: "Garden Grove Clog - Green", category: "garden_grove_clog", gender: "adults_m", price: 9.00, stock: 110 },
  { sku: "UA-GGC-BLU", name: "Garden Grove Clog - Blue", category: "garden_grove_clog", gender: "adults_m", price: 9.00, stock: 100 },

  // Garden Grove Clog - Women
  { sku: "W-GGC-BLK", name: "Garden Grove Clog - Black", category: "garden_grove_clog", gender: "women", price: 9.00, stock: 120 },
  { sku: "W-GGC-PNK", name: "Garden Grove Clog - Pink", category: "garden_grove_clog", gender: "women", price: 9.00, stock: 100 },

  // Lakeshore Sandal - Women
  { sku: "W-LKS-BLK", name: "Lakeshore Sandal - Black", category: "lakeshore_sandal", gender: "women", price: 8.00, stock: 130 },
  { sku: "W-LKS-TAN", name: "Lakeshore Sandal - Tan", category: "lakeshore_sandal", gender: "women", price: 8.00, stock: 110 },
  { sku: "W-LKS-WHT", name: "Lakeshore Sandal - White", category: "lakeshore_sandal", gender: "women", price: 8.00, stock: 100 },

  // Riviera Sandal - Women
  { sku: "W-RVS-BLK", name: "Riviera Sandal - Black", category: "riviera_sandal", gender: "women", price: 8.50, stock: 120 },
  { sku: "W-RVS-GLD", name: "Riviera Sandal - Gold", category: "riviera_sandal", gender: "women", price: 8.50, stock: 100 },
  { sku: "W-RVS-SLV", name: "Riviera Sandal - Silver", category: "riviera_sandal", gender: "women", price: 8.50, stock: 90 },

  // Everyday Sandal - Adults
  { sku: "UA-EVS-BLK", name: "Everyday Sandal - Black", category: "everyday_sandal", gender: "adults_m", price: 7.00, stock: 160 },
  { sku: "UA-EVS-NVY", name: "Everyday Sandal - Navy", category: "everyday_sandal", gender: "adults_m", price: 7.00, stock: 140 },
  { sku: "UA-EVS-GRY", name: "Everyday Sandal - Grey", category: "everyday_sandal", gender: "adults_m", price: 7.00, stock: 120 },

  // Everyday Sandal - Women
  { sku: "W-EVS-BLK", name: "Everyday Sandal - Black", category: "everyday_sandal", gender: "women", price: 7.00, stock: 140 },
  { sku: "W-EVS-PNK", name: "Everyday Sandal - Pink", category: "everyday_sandal", gender: "women", price: 7.00, stock: 120 },

  // Varsity Flip - Adults
  { sku: "UA-VFL-BLK", name: "Varsity Flip - Black", category: "varsity_flip", gender: "adults_m", price: 6.50, stock: 180 },
  { sku: "UA-VFL-NVY", name: "Varsity Flip - Navy", category: "varsity_flip", gender: "adults_m", price: 6.50, stock: 160 },
  { sku: "UA-VFL-GRY", name: "Varsity Flip - Grey", category: "varsity_flip", gender: "adults_m", price: 6.50, stock: 140 },

  // Varsity Flip - Women
  { sku: "W-VFL-BLK", name: "Varsity Flip - Black", category: "varsity_flip", gender: "women", price: 6.50, stock: 160 },
  { sku: "W-VFL-PNK", name: "Varsity Flip - Pink", category: "varsity_flip", gender: "women", price: 6.50, stock: 140 },

  // Studio Clog - Women
  { sku: "W-SCG-BLK", name: "Studio Clog - Black", category: "studio_clog", gender: "women", price: 10.00, stock: 120 },
  { sku: "W-SCG-GRY", name: "Studio Clog - Grey", category: "studio_clog", gender: "women", price: 10.00, stock: 100 },
  { sku: "W-SCG-WHT", name: "Studio Clog - White", category: "studio_clog", gender: "women", price: 10.00, stock: 90 },
  { sku: "W-SCG-NVY", name: "Studio Clog - Navy", category: "studio_clog", gender: "women", price: 10.00, stock: 80 },

  // Active Clog - Junior
  { sku: "UK-ACG-JR-BLK", name: "Active Clog Junior - Black", category: "active_clog", gender: "junior", price: 7.00, stock: 150 },
  { sku: "UK-ACG-JR-BLU", name: "Active Clog Junior - Blue", category: "active_clog", gender: "junior", price: 7.00, stock: 130 },
  { sku: "UK-ACG-JR-PNK", name: "Active Clog Junior - Pink", category: "active_clog", gender: "junior", price: 7.00, stock: 120 },

  // Popinz (Regalia) - price $0
  { sku: "PZ-ACG-BLK", name: "Popinz Active Clog - Black", category: "popinz", gender: "adults_m", price: 0, stock: 50, is_regalia: true },
  { sku: "PZ-ACG-WHT", name: "Popinz Active Clog - White", category: "popinz", gender: "adults_m", price: 0, stock: 40, is_regalia: true },
  { sku: "PZ-ACG-RED", name: "Popinz Active Clog - Red", category: "popinz", gender: "adults_m", price: 0, stock: 30, is_regalia: true },
  { sku: "PZ-VCG-BLK", name: "Popinz Varsity Clog - Black", category: "popinz", gender: "adults_m", price: 0, stock: 40, is_regalia: true },
  { sku: "PZ-VCG-NVY", name: "Popinz Varsity Clog - Navy", category: "popinz", gender: "adults_m", price: 0, stock: 30, is_regalia: true },
  { sku: "PZ-FLP-BLK", name: "Popinz Flip - Black", category: "popinz", gender: "adults_m", price: 0, stock: 60, is_regalia: true },
  { sku: "PZ-FLP-NVY", name: "Popinz Flip - Navy", category: "popinz", gender: "adults_m", price: 0, stock: 50, is_regalia: true },
  { sku: "PZ-WCG-BLK", name: "Popinz Work Clog - Black", category: "popinz", gender: "adults_m", price: 0, stock: 45, is_regalia: true },
  { sku: "PZ-WCG-WHT", name: "Popinz Work Clog - White", category: "popinz", gender: "adults_m", price: 0, stock: 35, is_regalia: true },
  { sku: "PZ-SCG-BLK", name: "Popinz Studio Clog - Black", category: "popinz", gender: "women", price: 0, stock: 40, is_regalia: true },
  { sku: "PZ-SCG-GRY", name: "Popinz Studio Clog - Grey", category: "popinz", gender: "women", price: 0, stock: 30, is_regalia: true },
  { sku: "PZ-GGC-BLK", name: "Popinz Garden Grove - Black", category: "popinz", gender: "adults_m", price: 0, stock: 25, is_regalia: true },
];

export interface JoybeesProduct {
  sku: string;
  name: string;
  category: string;
  gender: string;
  price: number;
  stock: number;
  is_regalia?: boolean;
}

export async function seedJoybeesProducts() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const results = { inserted: 0, skipped: 0, errors: [] as string[] };

  for (const p of PRODUCTS) {
    const { error } = await supabase.from("joybees_products").upsert(
      {
        sku: p.sku,
        name: p.name,
        category: p.category,
        gender: p.gender,
        price: p.price,
        stock: p.stock,
        is_regalia: p.is_regalia || false,
        active: true,
        popular: false,
      },
      { onConflict: "sku" }
    );
    if (error) {
      results.errors.push(`${p.sku}: ${error.message}`);
    } else {
      results.inserted++;
    }
  }

  return results;
}

export { PRODUCTS as JOYBEES_PRODUCTS };
