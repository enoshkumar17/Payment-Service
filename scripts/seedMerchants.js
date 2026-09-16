import dns from "dns";

dns.setServers(["1.1.1.1", "8.8.8.8"]);
import "dotenv/config";

import mongoose from "mongoose";
import { Merchant } from "../src/models/merchant.model.js";

const initialMerchants = [
  {
    name: "MovieHub",
    description: "Movie Ticket Booking Platform",
    status: "ACTIVE",
  },
  {
    name: "FoodBox",
    description: "Online Food Ordering Platform",
    status: "ACTIVE",
  },
];

async function seedMerchants() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("ERROR: MONGODB_URI environment variable is missing.");
    process.exit(1);
  }

  try {
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log("Connected successfully.");

    for (const merchantData of initialMerchants) {
      const existing = await Merchant.findOne({ name: merchantData.name });
      if (existing) {
        console.log(`[EXISTS] Merchant '${existing.name}' already present (ID: ${existing._id}). Skipping.`);
      } else {
        const apiKey = Merchant.generateApiKey();
        const created = await Merchant.create({
          name: merchantData.name,
          description: merchantData.description,
          status: merchantData.status,
          apiKey,
        });
        console.log(`[CREATED] Seeded merchant '${created.name}' successfully (ID: ${created._id}).`);
      }
    }

    console.log("\nMerchant seeding complete!");
  } catch (error) {
    console.error("Error during merchant seeding:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from database.");
  }
}

seedMerchants();
