"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMail = sendMail;
// mailer.js
const nodemailer_1 = __importDefault(require("nodemailer"));
// 1) Create transporter
const transporter = nodemailer_1.default.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: 'amancaraai@gmail.com',
        pass: 'tojx xlti wbio qccf',
    },
});
// 2) Send email function
function sendMail() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const info = yield transporter.sendMail({
                from: `"ANAMCARA Team 🍀" <${process.env.EMAIL_USER}>`,
                to: 'rahatalibaig810@gmail.com',
                subject: 'Test Mail',
                html: `Hello`,
            });
            console.log("✅ Email sent: %s", info.messageId);
            return info;
        }
        catch (error) {
            console.error("❌ Error sending email:", error);
            throw error;
        }
    });
}
