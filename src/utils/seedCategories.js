import Category from "../models/Category.model.js";

const categories = [
  // Main categories
  { name: "Fashion", description: "Latest fashion trends and clothing", order: 1 },
  { name: "Electronics", description: "Phones, laptops, gadgets", order: 2 },
  { name: "Bags", description: "Handbags, backpacks, wallets", order: 3 },
  { name: "Footwear", description: "Shoes, sandals, sneakers", order: 4 },
  { name: "Beauty", description: "Skincare, makeup, cosmetics", order: 5 },
  { name: "Jewelry", description: "Rings, necklaces, earrings", order: 6 },
  { name: "Wellness", description: "Health and wellness products", order: 7 },
  { name: "Gaming", description: "Gaming consoles and accessories", order: 8 },
  
  // Additional categories
  { name: "Home & Living", description: "Home decor and furniture", order: 9 },
  { name: "Sports", description: "Sports equipment and apparel", order: 10 },
  { name: "Books", description: "Books and literature", order: 11 },
  { name: "Toys", description: "Toys and games", order: 12 },
  { name: "Food & Grocery", description: "Food and grocery items", order: 13 },
  { name: "Office Supplies", description: "Office and stationery", order: 14 },
  { name: "Baby Products", description: "Baby care and products", order: 15 },
  { name: "Pet Supplies", description: "Pet food and accessories", order: 16 },
  { name: "Automotive", description: "Car accessories and parts", order: 17 },
  { name: "Musical Instruments", description: "Instruments and equipment", order: 18 },
  { name: "Art & Crafts", description: "Art supplies and crafts", order: 19 },
  { name: "Party Supplies", description: "Party decorations and supplies", order: 20 },
];

const seedCategories = async () => {
  try {
    console.log("Seeding categories...");
    
    for (const cat of categories) {
      const exists = await Category.findOne({ name: { $regex: new RegExp(`^${cat.name}$`, 'i') } });
      if (!exists) {
        await Category.create(cat);
        console.log(`Created category: ${cat.name}`);
      } else {
        console.log(`Category already exists: ${cat.name}`);
      }
    }
    
    console.log("Categories seeded successfully!");
  } catch (error) {
    console.error("Error seeding categories:", error);
  }
};

export default seedCategories;