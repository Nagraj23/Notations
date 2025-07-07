const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const UserModel = require("./models/user");
const NotesModel = require("./models/Notes");
const cors = require("cors");

const app = express();
const PORT = 5000;
const MONGO_URI =
  process.env.MONGO_URI ||
  "";

const TOKEN_SECRET =
  process.env.TOKEN_SECRET || "I5N2ZlYzdmMzc5YjciLCJpYXQiOjE3MzIwMjc";

app.use(bodyParser.json());
app.use(cors());

mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

app.get("/", (req, res) => {
  res.send("hello");
});

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
    const user = new UserModel({ email, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (e) {
    res.status(500).json({ message: "Internal server error" });
  }
});

const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(403).json({ message: "No token provided" });
  }
  jwt.verify(token, TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Failed to authenticate token" });
    }
    req.userId = decoded.userId;
    next();
  });
};

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
    const token = jwt.sign({ userId: user._id }, TOKEN_SECRET);
    res.json({
      success: true,
      token,
      userData: { email: user.email, id: user._id },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/create", verifyToken, async (req, res) => {
  const { title, content } = req.body;
  const userId = req.userId;
  if (!title || !content) {
    return res
      .status(400)
      .json({ message: "Title and content are required" });
  }
  try {
    const note = new NotesModel({ title, content, user: userId });
    const savedNote = await note.save();
    await UserModel.findByIdAndUpdate(userId, {
      $push: { notes: savedNote._id },
    });
    res
      .status(201)
      .json({ message: "Note created successfully", note: savedNote });
  } catch (e) {
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
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/notes/:id", verifyToken, async (req, res) => {
  const noteId = req.params.id;
  const userId = req.userId;
  if (!noteId || !mongoose.Types.ObjectId.isValid(noteId)) {
    return res.status(400).json({ error: "Invalid or missing note ID." });
  }
  try {
    const note = await NotesModel.findOne({ _id: noteId, user: userId });
    if (!note) {
      return res.status(404).json({ error: "Note not found or access denied." });
    }
    return res.status(200).json(note);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.delete("/delete/:id", verifyToken, async (req, res) => {
  const noteId = req.params.id;
  if (!noteId || !mongoose.Types.ObjectId.isValid(noteId)) {
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
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/edit/:id", verifyToken, async (req, res) => {
  const noteId = req.params.id;
  const { title, content } = req.body;
  if (!noteId || !mongoose.Types.ObjectId.isValid(noteId)) {
    return res.status(400).json({ error: "Invalid or missing note ID" });
  }
  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required" });
  }
  try {
    const updatedNote = await NotesModel.findOneAndUpdate(
      { _id: noteId, user: req.userId },
      { title, content },
      { new: true }
    );
    if (!updatedNote) {
      return res.status(404).json({ error: "Note not found or access denied" });
    }
    res.status(200).json({ message: "Note updated successfully", note: updatedNote });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
