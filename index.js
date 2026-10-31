import { MongoClient } from 'mongodb';
import 'dotenv/config'
import express from "express";

const app = express();
const PORT = process.env.PORT || 5000



const client = new MongoClient(process.env.MONGODB_URI);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

connectToMongoDB();


app.get("/", (req, res) => {
  res.send("Hello would from express");
});

app.listen(PORT, () => {
  console.log(`server is running f ${PORT}`);
});
