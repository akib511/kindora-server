import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config'
import express from "express";
import cors from "cors"

const app = express();
const PORT = process.env.PORT || 5000


app.use(cors());
app.use(express.json());


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


//data connections ..
const connectClient = await connectToMongoDB();

const db = connectClient.db("kindora");

const eventsCollections = db.collection("events");
const joinedEventsCollections = db.collection("joinedEvents");




// Create Event
app.post("/events", async (req, res) => {
  try {
    const eventData = req.body;

    if (!eventData.creatorEmail) {
      return res.status(400).send({ message: "creatorEmail (user email) is required" });
    }

    const result = await eventsCollections.insertOne({
      ...eventData,
      createdAt: new Date(),
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to create event",
      error: error.message,
    });
  }
});


// Get All Events
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



// Get Single Event
app.get("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { ObjectId } = await import("mongodb");

    const result = await eventsCollections.findOne({
      _id: new ObjectId(id),
    });

    if (!result) {
      return res.status(404).send({
        message: "Event not found",
      });
    }

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get event",
      error: error.message,
    });
  }
});





// Delete Event

app.delete("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.query;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event id" });
    }

    if (!userEmail) {
      return res.status(400).send({ message: "userEmail is required" });
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

// Update Event 
app.put("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail, ...eventData } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event id" });
    }

    if (!userEmail) {
      return res.status(400).send({ message: "userEmail is required" });
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

  
    delete eventData._id;
    delete eventData.creatorEmail;

    const result = await eventsCollections.updateOne(
      { _id: new ObjectId(id) },
      { $set: eventData }
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

// Join Event
app.post("/join-event", async (req, res) => {
  try {
    const { eventId, userEmail } = req.body;

    const { ObjectId } = await import("mongodb");

    const alreadyJoined = await joinedEventsCollections.findOne({
      eventId: new ObjectId(eventId),
      userEmail: userEmail,
    });

    if (alreadyJoined) {
      return res.status(409).send({
        message: "You already joined this event",
      });
    }

    const joinData = {
      eventId: new ObjectId(eventId),
      userEmail,
      joinedAt: new Date(),
    };

    const result = await joinedEventsCollections.insertOne(joinData);

    res.send({
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



// Get Joined Events
app.get("/joined-events/:email", async (req, res) => {
  try {
    const email = req.params.email;

    const result = await joinedEventsCollections
      .aggregate([
        {
          $match: { userEmail: email },
        },
        {
          $lookup: {
            from: "events",
            localField: "eventId",
            foreignField: "_id",
            as: "event",
          },
        },
        {
          $unwind: "$event",
        },
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




// Leave Event
app.delete("/leave-event/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.query;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid joined event id" });
    }

    if (!userEmail) {
      return res.status(400).send({ message: "userEmail is required" });
    }

    const result = await joinedEventsCollections.deleteOne({
      _id: new ObjectId(id),
      userEmail: userEmail,
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Joined event not found",
      });
    }

    res.send({
      message: "Successfully left the event",
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to leave event",
      error: error.message,
    });
  }
});


// Get 6 nearest upcoming events
app.get("/recent-events", async (req, res) => {
  try {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
    }).format(new Date());

    const recentEvents = await eventsCollections
      .find({ date: { $gte: today } })
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



// Get events created by a specific user 
app.get("/my-events/:email", async (req, res) => {
  try {
    const result = await eventsCollections
      .find({ creatorEmail: req.params.email })
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
  res.send("wellcome to kindora server");
});

app.listen(PORT, () => {
  console.log(`server is running on ${PORT}`);
});
