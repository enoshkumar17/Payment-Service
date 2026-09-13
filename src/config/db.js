import mongoose from "mongoose"

const connectToDb = async()=>{
  try {
    const connectionInstance = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 2500,
    })

    console.log(`MongoDB connected!. DB Host: ${connectionInstance.connection.host}`)
    global.IS_LOCAL_DEMO = false;
  } catch (error) {
    console.log("\n[LOCAL DEMO MODE] MongoDB Atlas unreachable (College Wi-Fi / Offline).")
    console.log("Starting server in Local In-Memory Demo Mode with pre-seeded platforms & transactions.")
    global.IS_LOCAL_DEMO = true;
  }
}

export default connectToDb
