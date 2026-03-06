const express = require('express');
const router = express.Router();
const Item = require('../models/item');

router.get('/', async (req, res) => {
    try {
        const items = await Item.find();
        res.json(items);
    } catch (err) {
        res.status(500).json({ message: "Error fetching inventory" });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const foundItem = await Item.findOne({ id: req.params.id });

        if (!foundItem) {
            return res.status(404).json({ message: "Item not found" });
        }

        res.json(foundItem);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;