require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const app = express();
const port = process.env.PORT || 200;
const httpServer = http.createServer(app);

mongoose.connect(
  process.env.MONGO_URI,
  { useNewUrlParser: true, useUnifiedTopology: true },
  (e) => {
    if (!e) {
      console.log("\x1b[36m", "Db connection successful", "\x1b[0m");
    } else {
      console.log(e, "\x1b[36m", "Db connection unsuccessful", "\x1b[0m");
    }
  }
);

app.use(express.json({ extended: false }));
app.use(
  cors({
    origin: "*",
  })
);
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache");

  res.setHeader(
    "Access-Control-Allow-Method",
    "OPTIONS, GET, POST, PUT, PATCH, DELETE"
  );
  next();
});


app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader(
    "Access-Control-Allow-Method",
    "OPTIONS, GET, POST, PUT, PATCH, DELETE"
  );
  next();
});

// route included

app.use("/psypack", require("./routes/psypack/psypack.js"));
app.use("/", require("./routes/client/user"));
app.use("/login", require("./routes/login/login"));
app.get("/", (req, res) => {
  res.send("Server running!");
});

httpServer.listen(port, () => console.log(`server started on port ${port}`));
