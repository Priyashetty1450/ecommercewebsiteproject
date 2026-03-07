const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

/* ================= GET ALL PRODUCTS ================= */

router.get('/', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= ADD PRODUCT ================= */

router.post('/', async (req, res) => {
  try {
    const product = new Product({
      name: req.body.name,
      image: req.body.image,
      price: req.body.price,
      stock: req.body.stock,
      category: req.body.category,
      description: req.body.description
    });

    const newProduct = await product.save();
    res.status(201).json(newProduct);

  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* ================= UPDATE PRODUCT ================= */

router.put('/:id', async (req, res) => {
  try {
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json(updatedProduct);

  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* ================= DELETE PRODUCT ================= */

router.delete('/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;