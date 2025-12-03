const mongoose = require("mongoose");

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/typing-platform";

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      autoIndex: false,       
      maxPoolSize: 10,         
      serverSelectionTimeoutMS: 5000, 
      socketTimeoutMS: 45000,  
      family: 4,             
    });

    console.log("✅ MongoDB connected successfully");

  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};


process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("🛑 MongoDB connection closed (SIGINT)");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await mongoose.connection.close();
  console.log("🛑 MongoDB connection closed (SIGTERM)");
  process.exit(0);
});

module.exports = connectDB;
