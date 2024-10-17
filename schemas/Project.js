const mongoose = require("mongoose");
const Joi = require("joi");

const projectSchema = new mongoose.Schema({
    user: { type: mongoose.Mixed },
    displayName: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        default: 'care',
        required: true,
    },
    access: [{
        type: mongoose.Schema.ObjectId,
        ref: "User",
    }],
    createdAt: {
        type: Date,
        default: Date.now(),
    },
});

const projectValidationSchema = Joi.object({
    user: Joi.array().items(Joi.string().trim()),
    displayName: Joi.string().required(),
    description: Joi.string().required(),
    category: Joi.string().default('care').required(),
    access: Joi.array().items(Joi.string().trim()), 
    createdAt: Joi.date(),
});

function validateProject(project) {
  return projectValidationSchema.validate(project);
}

const Project = mongoose.model("Project", projectSchema);
module.exports = { Project, validateProject };
