const express = require("express");
const router = express.Router();

const {
  createdAtCompetition,
  getCompetitionByCode,
} = require("../controllers/competition");


router.post("/create", createdAtCompetition);


router.get("/:code", getCompetitionByCode);

module.exports = router;
