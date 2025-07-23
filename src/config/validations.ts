import Joi from "joi";


export const userSchema = Joi.object({
  firstname: Joi.string().trim().min(2).required(),
  lastname: Joi.string().trim().min(2).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid("user", "admin").optional(),
  active: Joi.boolean().optional(),
});