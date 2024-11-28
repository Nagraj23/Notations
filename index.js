const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const UserModel = require("./models/user");
const NotesModel = require("./models/Notes");
const cors = require('cors');



const app = express();
const PORT = 5000;
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://Nagraj:Nandal1323@cluster0.gljq1.mongodb.net/Notations?";
// Environment variables for security
const TOKEN_SECRET =
  process.env.TOKEN_SECRET || "I5N2ZlYzdmMzc5YjciLCJpYXQiOjE3MzIwMjc";

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Connect to MongoDB
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    serverSelectionTimeoutMS: 5000
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1); // Exit if DB connection fails
  });


app.get('/',(req,res)=>{
  res.send("hello")
})
// Register Route
app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const oldUser = await UserModel.findOne({ email });
    if (oldUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new UserModel({
      email,
      password: hashedPassword,
    });

    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (e) {
    console.error("Registration error:", e);
    res.status(500).json({ message: "Internal server error" });
  }
});

const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(403).json({ message: "No token provided" });
  }

  jwt.verify(token, "Secret", (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Failed to authenticate token" });
    }
    req.userId = decoded.userId;
    next();
  });
};

// Login Route
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, "Secret");

    res.json({
      success: true,
      token,
      userData: { email: user.email, id: user._id },
    });
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Create Note Route
app.post("/create", verifyToken, async (req, res) => {
  const { title, content, user_id: userId } = req.body;

  console.log(userId);
  if (!title || !content || !userId) {
    return res
      .status(400)
      .json({ message: "Title, content, and user ID are required" });
  }

  try {
    // Create a new note
    const note = new NotesModel({
      title,
      content,
      user: userId, // Associate the note with the user
    });

    // Save the note
    const savedNote = await note.save();

    console.log(savedNote);
    // Update the user's notes array
    await UserModel.findByIdAndUpdate(userId, {
      $push: { notes: savedNote._id },
    });

    res
      .status(201)
      .json({ message: "Note created successfully", note: savedNote });
  } catch (e) {
    console.error("Error creating note:", e);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/notes", verifyToken, async (req, res) => {
  try {
    const userNotes = await NotesModel.find({ user: req.userId }).populate(
      "user",
      "email"
    );
    res.status(200).json({ notes: userNotes });
  } catch (e) {
    console.error("Error fetching notes:", e);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/delete/:id", verifyToken, async (req, res) => {
  const noteId = req.params.id;

  if (!noteId || !mongoose.Types.ObjectId.isValid(noteId)) {
    console.log("Invalid note ID:", noteId); // Debug log
    return res.status(400).json({ error: "Invalid or missing note ID" });
  }

  try {
    const note = await NotesModel.findOne({ _id: noteId, user: req.userId });

    if (!note) {
      return res.status(404).json({ error: "Note not found or access denied" });
    }

    await NotesModel.findByIdAndDelete(noteId);

    await UserModel.findByIdAndUpdate(req.userId, {
      $pull: { notes: noteId },
    });

    return res.status(200).json({ message: "Note deleted successfully" });
  } catch (error) {
    console.error("Error deleting note:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/edit/:id", verifyToken, async (req, res) => {
  console.log("Edit route hit"); // Debug log
  const noteId = req.params.id;
  const { title, content } = req.body;

  if (!noteId || !mongoose.Types.ObjectId.isValid(noteId)) {
    console.log("Invalid note ID:", noteId); // Debug log
    return res.status(400).json({ error: "Invalid or missing note ID" });
  }

  if (!title || !content) {
    console.log("Missing title or content:", { title, content }); // Debug log
    return res.status(400).json({ error: "Title and content are required" });
  }

  try {
    const updatedNote = await NotesModel.findOneAndUpdate(
      { _id: noteId, user: req.userId }, // Ensure note belongs to the user
      { title, content }, // Update fields
      { new: true } // Return updated document
    );

    console.log("Updated Note:", updatedNote); // Debug log

    if (!updatedNote) {
      console.log("Note not found or access denied");
      return res.status(404).json({ error: "Note not found or access denied" });
    }

    res
      .status(200)
      .json({ message: "Note updated successfully", note: updatedNote });
  } catch (error) {
    console.error("Error updating note:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
