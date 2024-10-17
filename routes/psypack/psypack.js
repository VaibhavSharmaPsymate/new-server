const express = require('express');
const router = express.Router();
const {getallAssessments, getPsychoEducation, generateReport, getReport} = require("./controllers/projectController");

router.route('/list').get(getallAssessments);
router.route('/psychoEducation/:id').get(getPsychoEducation);
router.route('/report/generate').post(generateReport);
router.route('/report/:id').post(getReport);

module.exports = router;
