import { MongoClient, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";
import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 5000;

// Frontend URL (production e real domain dibo)
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// ---------------- JWT verify middleware ----------------
const JWKS = createRemoteJWKSet(new URL(`${FRONTEND_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).send({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: FRONTEND_URL,
      audience: FRONTEND_URL,
    });

    req.user = payload;
    next();
  } catch (error) {
    console.error("JWT error:", error.message);
    res.status(401).send({ message: "Invalid or expired token" });
  }
};
// -------------------------------------------------------

// ---------------- MongoDB connection ----------------
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

const connectClient = await connectToMongoDB();

const db = connectClient.db("kindora");

const eventsCollections = db.collection("events");
const joinedEventsCollections = db.collection("joinedEvents");
// ----------------------------------------------------

// Aajker tarikh (Dhaka time, YYYY-MM-DD)
const getToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
  }).format(new Date());

// ---------------- Create Event (secured) ----------------
app.post("/events", verifyToken, async (req, res) => {
  try {
    // Shudhu allowed field
    const { title, description, category, image, location, date } = req.body;

    if (!title || !description || !category || !image || !location || !date) {
      return res.status(400).send({ message: "All fields are required" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < getToday()) {
      return res.status(400).send({ message: "Invalid or past date" });
    }

    // Identity shudhu token theke
    const creatorEmail = req.user.email;
    const creatorName = req.user.name;

    if (!creatorEmail) {
      return res.status(401).send({ message: "User email not found in token" });
    }

    const result = await eventsCollections.insertOne({
      title: String(title).trim(),
      description: String(description).trim(),
      category: String(category).trim(),
      image: String(image).trim(),
      location: String(location).trim(),
      date,
      creatorEmail,
      creatorName,
      createdAt: new Date(),
    });

    res.status(201).send({
      message: "Event created successfully",
      result,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to create event",
      error: error.message,
    });
  }
});

// ---------------- Get All Events ----------------
app.get("/events", async (req, res) => {
  try {
    const result = await eventsCollections.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get events",
      error: error.message,
    });
  }
});

// ---------------- Get Single Event ----------------
app.get("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event id" });
    }

    const result = await eventsCollections.findOne({ _id: new ObjectId(id) });

    if (!result) {
      return res.status(404).send({ message: "Event not found" });
    }

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get event",
      error: error.message,
    });
  }
});

// ---------------- Delete Event (secured) ----------------
app.delete("/events/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event id" });
    }

    if (!userEmail) {
      return res.status(401).send({ message: "User email not found in token" });
    }

    const event = await eventsCollections.findOne({ _id: new ObjectId(id) });

    if (!event) {
      return res.status(404).send({ message: "Event not found" });
    }

    if (event.creatorEmail !== userEmail) {
      return res.status(403).send({
        message: "You are not allowed to delete this event",
      });
    }

    const result = await eventsCollections.deleteOne({ _id: new ObjectId(id) });

    await joinedEventsCollections.deleteMany({ eventId: new ObjectId(id) });

    res.send({
      message: "Event deleted successfully",
      result,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to delete event",
      error: error.message,
    });
  }
});

// ---------------- Update Event (secured) ----------------
app.put("/events/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event id" });
    }

    if (!userEmail) {
      return res.status(401).send({ message: "User email not found in token" });
    }

    const event = await eventsCollections.findOne({ _id: new ObjectId(id) });

    if (!event) {
      return res.status(404).send({ message: "Event not found" });
    }

    if (event.creatorEmail !== userEmail) {
      return res.status(403).send({
        message: "You are not allowed to edit this event",
      });
    }

    // Shudhu allowed field
    const { title, description, category, image, location, date } = req.body;

    const updateData = {};
    if (title) updateData.title = String(title).trim();
    if (description) updateData.description = String(description).trim();
    if (category) updateData.category = String(category).trim();
    if (image) updateData.image = String(image).trim();
    if (location) updateData.location = String(location).trim();

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < getToday()) {
        return res.status(400).send({ message: "Invalid or past date" });
      }
      updateData.date = date;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).send({ message: "No valid fields to update" });
    }

    const result = await eventsCollections.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    res.send({
      message: "Event updated successfully",
      result,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to update event",
      error: error.message,
    });
  }
});

// ---------------- Join Event (secured) ----------------
app.post("/join-event", verifyToken, async (req, res) => {
  try {
    const { eventId } = req.body;
    const userEmail = req.user.email;

    if (!userEmail) {
      return res.status(401).send({ message: "User email not found in token" });
    }

    if (!eventId || !ObjectId.isValid(eventId)) {
      return res.status(400).send({ message: "Invalid event id" });
    }

    const event = await eventsCollections.findOne({
      _id: new ObjectId(eventId),
    });

    if (!event) {
      return res.status(404).send({ message: "Event not found" });
    }

    const alreadyJoined = await joinedEventsCollections.findOne({
      eventId: new ObjectId(eventId),
      userEmail,
    });

    if (alreadyJoined) {
      return res.status(409).send({
        message: "You already joined this event",
      });
    }

    const result = await joinedEventsCollections.insertOne({
      eventId: new ObjectId(eventId),
      userEmail,
      joinedAt: new Date(),
    });

    res.status(201).send({
      message: "Event joined successfully",
      result,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to join event",
      error: error.message,
    });
  }
});

// ---------------- Get my joined events (secured) ----------------
app.get("/joined-events", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;

    const result = await joinedEventsCollections
      .aggregate([
        { $match: { userEmail: email } },
        {
          $lookup: {
            from: "events",
            localField: "eventId",
            foreignField: "_id",
            as: "event",
          },
        },
        { $unwind: "$event" },
      ])
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get joined events",
      error: error.message,
    });
  }
});

// ---------------- Leave Event (secured) ----------------
app.delete("/leave-event/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid joined event id" });
    }

    const result = await joinedEventsCollections.deleteOne({
      _id: new ObjectId(id),
      userEmail,
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Joined event not found" });
    }

    res.send({ message: "Successfully left the event" });
  } catch (error) {
    res.status(500).send({
      message: "Failed to leave event",
      error: error.message,
    });
  }
});

// ---------------- Get 6 nearest upcoming events ----------------
app.get("/recent-events", async (req, res) => {
  try {
    const recentEvents = await eventsCollections
      .find({ date: { $gte: getToday() } })
      .sort({ date: 1 })
      .limit(6)
      .toArray();

    res.send(recentEvents);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get recent events",
      error: error.message,
    });
  }
});

// ---------------- Get my created events (secured) ----------------
app.get("/my-events", verifyToken, async (req, res) => {
  try {
    const result = await eventsCollections
      .find({ creatorEmail: req.user.email })
      .sort({ date: 1 })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get your events",
      error: error.message,
    });
  }
});

app.get("/", (req, res) => {
  res.send("welcome to kindora server");
});

app.listen(PORT, () => {
  console.log(`server is running on ${PORT}`);
});