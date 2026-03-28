const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const morgan = require("morgan");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const cartRoutes = require("./routes/cart");
const contactRoutes = require("./routes/contact");
const paymentRoutes = require("./routes/payment");

const Item = require("./models/item");
const User = require("./models/User");

const app = express();
const PORT = process.env.PORT || 5000;
const frontendPath = path.join(__dirname, "../frontend");

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "google-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      httpOnly: true
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(frontendPath));

mongoose.set("strictQuery", false);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_REDIRECT_URI ||
        "https://ecommercewebsiteproject.onrender.com/api/auth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({
          email: profile.emails[0].value
        });

        if (!user) {
          user = await User.create({
            username: profile.displayName,
            email: profile.emails[0].value,
            googleId: profile.id,
            isGoogleAuth: true,
            role: "user"
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/payment", paymentRoutes);

app.get("/api/inventory", async (req, res) => {
  const items = await Item.find();
  res.json(items);
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

app.get("/", (req, res) =>
  res.sendFile(path.join(frontendPath, "pages/home/Landing.html"))
);

app.get("/shop", (req, res) =>
  res.sendFile(path.join(frontendPath, "pages/shop/shop.html"))
);

app.get("/collection", (req, res) =>
  res.sendFile(path.join(frontendPath, "pages/shop/collection.html"))
);

app.get("/cart", (req, res) =>
  res.sendFile(path.join(frontendPath, "pages/cart/cart.html"))
);

app.get("/checkout", (req, res) =>
  res.sendFile(path.join(frontendPath, "pages/checkout/checkout.html"))
);

app.get("/contact", (req, res) =>
  res.sendFile(path.join(frontendPath, "pages/contact/Contact-us.html"))
);

app.get("/help", (req, res) =>
  res.sendFile(path.join(frontendPath, "pages/contact/help.html"))
);

app.get("/about", (req, res) =>
  res.sendFile(path.join(frontendPath, "pages/info/About.html"))
);

app.get("/service", (req, res) =>
  res.sendFile(path.join(frontendPath, "pages/info/Service.html"))
);

app.get("/track-order", (req, res) =>
  res.sendFile(path.join(frontendPath, "pages/orders/track-order.html"))
);

app.get("/admin", (req, res) =>
  res.sendFile(path.join(frontendPath, "pages/admin/admin.html"))
);

app.use((req, res) => {
  res.status(404).send("Page not found");
});

async function connectDatabase() {
  await mongoose.connect(process.env.DATABASE_URL, {
    serverSelectionTimeoutMS: 10000
  });

  console.log("MongoDB Connected");

  const existingAdmin = await User.findOne({
    username: process.env.ADMIN_USER
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASS, 10);

    await User.create({
      username: process.env.ADMIN_USER,
      email: process.env.ADMIN_EMAIL,
      password: hashedPassword,
      role: "admin"
    });

    console.log("Admin user created");
  }
}

async function startServer() {
  try {
    await connectDatabase();

    app.listen(PORT, () => {
      console.log(`Server running on port: ${PORT}`);
    });
  } catch (err) {
    console.error("MongoDB Error:", err);

    if (err?.name === "MongooseServerSelectionError") {
      console.error(
        "MongoDB Atlas rejected the connection. Add your current public IP to Atlas Network Access, or update the access list if you recently changed networks."
      );
    }

    process.exit(1);
  }
}

startServer();
