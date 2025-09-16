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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveUserController = exports.getUnapprovedUsersController = exports.removeTrustedDeviceController = exports.getTrustedDevicesController = exports.regenerateBackupCodesController = exports.verify2FABackupCodeController = exports.verify2FALoginController = exports.disable2FAController = exports.enable2FAController = exports.verify2FASetupController = exports.setup2FAController = exports.get2FAStatusController = exports.generateSummary = exports.getServiceById = exports.getSellerServices = exports.getAllServices = exports.addSellerservice = exports.getSellerDataController = exports.becomeSellerController = exports.resetPasswordController = exports.forgotPasswordController = exports.loginController = exports.verifyEmailController = exports.registerController = void 0;
const app_1 = require("../app");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const validations_1 = require("../config/validations");
const mailer_1 = require("../config/mailer");
const uuid_1 = require("uuid");
const generateTokens_1 = require("../config/generateTokens");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const openai_service_1 = require("../services/openai.service");
const speakeasy_1 = __importDefault(require("speakeasy"));
const qrcode_1 = __importDefault(require("qrcode"));
const crypto_1 = __importDefault(require("crypto"));
const RESET_PASSWORD_SECRET = "anamcara_reset_password_secret";
const registerController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // 1. Validate input using Joi
        const { error: validationError, value: validatedData } = validations_1.userSchema.validate(req.body, {
            abortEarly: false,
        });
        if (validationError) {
            return res.status(400).json({
                error: "Validation failed.",
                details: validationError.details.map((d) => d.message),
            });
        }
        const { firstname, lastname, email, password, role } = validatedData;
        // 2. Check if email already exists
        const { data: existingUser } = yield app_1.supabase
            .from("anamcara_users")
            .select("id")
            .eq("email", email)
            .single();
        if (existingUser) {
            return res
                .status(409)
                .json({ error: "User with this email already exists." });
        }
        // 3. Generate verification token
        const verificationToken = (0, uuid_1.v4)();
        // 4. Try sending the verification email
        try {
            yield (0, mailer_1.sendVerificationEmail)(email);
        }
        catch (emailError) {
            console.error("Failed to send verification email:", emailError);
            return res.status(500).json({
                error: "Failed to send verification email.",
            });
        }
        // 5. Hash password
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        // 6. Insert user into database
        const { data, error: insertError } = yield app_1.supabase
            .from("anamcara_users")
            .insert([
            {
                firstname,
                lastname,
                email,
                password: hashedPassword,
                role: role || "user",
                active: false,
            },
        ])
            .select()
            .single();
        if (insertError) {
            return res.status(500).json({
                error: "Failed to register user.",
                details: insertError.message,
            });
        }
        // 7. Omit password from response
        const { password: _ } = data, user = __rest(data, ["password"]);
        return res.status(201).json({
            message: "User registered successfully. Verification email sent.",
            user,
        });
    }
    catch (err) {
        console.error("Unexpected error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
});
exports.registerController = registerController;
const verifyEmailController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email } = req.query; // Or req.body.email depending on how it's sent
        if (!email || typeof email !== "string") {
            return res.status(400).json({ error: "Email is required for verification." });
        }
        // Check if user exists
        const { data: user, error: fetchError } = yield app_1.supabase
            .from("anamcara_users")
            .select("*")
            .eq("email", email)
            .single();
        if (fetchError || !user) {
            return res.status(404).json({ error: "User not found." });
        }
        if (user.active) {
            return res.status(400).json({ message: "User is already verified." });
        }
        // Update user to active
        const { error: updateError } = yield app_1.supabase
            .from("anamcara_users")
            .update({ active: true })
            .eq("email", email);
        if (updateError) {
            return res.status(500).json({ error: "Failed to verify email.", details: updateError.message });
        }
        return res.status(200).json({ message: "Email verified successfully." });
    }
    catch (err) {
        console.error("Verification error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
});
exports.verifyEmailController = verifyEmailController;
const loginController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }
        // Check if user exists
        const { data: user, error } = yield app_1.supabase
            .from("anamcara_users")
            .select("*")
            .eq("email", email)
            .single();
        if (error || !user) {
            return res.status(404).json({ error: "User with this email does not exist." });
        }
        if (!user.active) {
            return res.status(401).json({ error: "Please verify your email before logging in." });
        }
        // Check password
        const isPasswordValid = yield bcryptjs_1.default.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid password." });
        }
        // Create tokens
        const payload = {
            id: user.id,
            email: user.email,
            role: user.role,
        };
        const accessToken = (0, generateTokens_1.generateAccessToken)(payload);
        const refreshToken = (0, generateTokens_1.generateRefreshToken)(payload);
        const { password: _ } = user, userInfo = __rest(user, ["password"]);
        return res.status(200).json({
            message: "Login successful.",
            user: userInfo,
            tokens: {
                accessToken,
                refreshToken,
            },
        });
    }
    catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
});
exports.loginController = loginController;
const forgotPasswordController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: "Email is required." });
        }
        // 1. Check if user exists
        const { data: user, error: userError } = yield app_1.supabase
            .from("anamcara_users")
            .select("id, email, firstname")
            .eq("email", email)
            .single();
        if (userError || !user) {
            return res.status(404).json({ error: "User with this email does not exist." });
        }
        // 2. Generate password reset token (valid for 15 mins)
        const token = jsonwebtoken_1.default.sign({ email: user.email, id: user.id }, RESET_PASSWORD_SECRET, { expiresIn: "15m" });
        const resetLink = `https://yourfrontend.com/reset-password?token=${token}`;
        // 3. Send email
        yield (0, mailer_1.sendResetPasswordEmail)(user.email, token);
        return res.status(200).json({ message: "Password reset email sent successfully." });
    }
    catch (err) {
        console.error("Forgot password error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
});
exports.forgotPasswordController = forgotPasswordController;
const resetPasswordController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { token } = req.query;
        const { password } = req.body;
        // 1. Check token
        if (!token || typeof token !== "string") {
            return res.status(400).json({ error: "Token is required." });
        }
        const decoded = (0, generateTokens_1.verifyResetToken)(token);
        if (!decoded || typeof decoded !== "object" || !("email" in decoded)) {
            return res.status(400).json({ error: "Invalid or expired token." });
        }
        const email = decoded.email;
        // 2. Validate password
        if (!password || password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters long." });
        }
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        // 3. Update password in DB
        const { error: updateError } = yield app_1.supabase
            .from("anamcara_users")
            .update({ password: hashedPassword })
            .eq("email", email);
        if (updateError) {
            return res.status(500).json({ error: "Failed to update password.", details: updateError.message });
        }
        return res.status(200).json({ message: "Password reset successfully." });
    }
    catch (error) {
        console.error("Reset password error:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});
exports.resetPasswordController = resetPasswordController;
const becomeSellerController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { niche, description, city, country, slogan, languages } = req.body;
        // Validate required fields
        const requiredFields = { niche, description, city, country, slogan, languages };
        const missingFields = Object.entries(requiredFields)
            .filter(([_, value]) => !value)
            .map(([key]) => key);
        if (missingFields.length > 0) {
            // @ts-ignore
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`,
                status: 400
            });
        }
        // Check if profile exists
        const { data: existingProfile, error: checkError } = yield app_1.supabase
            .from('sellers')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();
        if (checkError)
            throw checkError;
        let operationResponse;
        if (existingProfile) {
            // Update existing profile
            const { data, error } = yield app_1.supabase
                .from('sellers')
                .update({
                niche,
                description,
                city,
                country,
                slogan,
                languages: JSON.stringify(languages),
            })
                .eq('user_id', userId)
                .select()
                .single();
            if (error)
                throw error;
            operationResponse = {
                status: 200,
                message: 'Seller profile updated successfully',
                data
            };
        }
        else {
            // Create new profile
            const { data, error } = yield app_1.supabase
                .from('sellers')
                .insert({
                user_id: userId,
                niche,
                description,
                city,
                country,
                slogan,
                languages: JSON.stringify(languages)
            })
                .select()
                .single();
            if (error)
                throw error;
            operationResponse = {
                status: 201,
                message: 'Seller profile created successfully',
                data
            };
        }
        res.status(operationResponse.status).json({
            success: true,
            message: operationResponse.message,
            data: operationResponse.data,
            metadata: {
                timestamp: new Date().toISOString()
            }
        });
    }
    catch (error) {
        console.error('Error processing seller profile:', error.message);
        let status = 500;
        let message = 'Failed to process seller profile';
        if (error.code === '23505') { // Postgres unique violation
            status = 409;
            message = 'Seller profile already exists for this user';
        }
        else if (((_b = error.response) === null || _b === void 0 ? void 0 : _b.status) === 400) {
            status = 400;
            message = ((_c = error.response.data) === null || _c === void 0 ? void 0 : _c.message) || 'Validation failed';
        }
        res.status(status).json({
            success: false,
            message,
            error: error.message,
            status,
            metadata: {
                timestamp: new Date().toISOString()
            }
        });
    }
});
exports.becomeSellerController = becomeSellerController;
const getSellerDataController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // const userId = req.user?.id;
        const userId = (_a = req.params) === null || _a === void 0 ? void 0 : _a.id;
        const { data, error } = yield app_1.supabase
            .from('sellers')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
        if (error)
            throw error;
        if (!data) {
            return res.status(200).json({
                success: true,
                message: 'No seller profile found',
                hasProfile: false
            });
        }
        res.status(200).json({
            success: true,
            hasProfile: true,
            data: Object.assign({}, data)
        });
    }
    catch (error) {
        console.error('Error fetching seller data:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch seller data',
            error: error.message
        });
    }
});
exports.getSellerDataController = getSellerDataController;
const addSellerservice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { seller_id, service_title, service_category, description, keywords, thumbnails, plans, booking_prices } = req.body;
        // Validate required fields
        if (!seller_id || !service_title || !description) {
            return res.status(400).json({
                success: false,
                message: 'Seller ID, service title, and description are required'
            });
        }
        // Validate booking prices (must be array of exactly 3 numbers)
        if (!Array.isArray(booking_prices) || booking_prices.length !== 3 ||
            !booking_prices.every(price => typeof price === 'number')) {
            return res.status(400).json({
                success: false,
                message: 'Booking prices must be an array of exactly 3 numbers'
            });
        }
        // Insert main service data
        const { data: serviceData, error: serviceError } = yield app_1.supabase
            .from('services')
            .insert([{
                seller_id,
                service_title,
                service_category,
                description,
                keywords: keywords || [],
                thumbnails: thumbnails || [],
                is_active: true,
                bookingcall_array: booking_prices
            }])
            .select();
        if (serviceError) {
            throw serviceError;
        }
        const serviceId = serviceData[0].id;
        // Insert service plans if they exist
        if (plans && plans.length > 0) {
            const formattedPlans = plans.map((plan) => ({
                service_id: serviceId,
                plan_name: plan.name,
                plan_price: plan.price,
                is_active: plan.active !== false,
            }));
            const { error: plansError } = yield app_1.supabase
                .from('services_plan')
                .insert(formattedPlans);
            if (plansError) {
                throw plansError;
            }
        }
        // Fetch complete service data with plans
        const { data: completeService, error: fetchError } = yield app_1.supabase
            .from('services')
            .select(`
        *,
        services_plan (*)
      `)
            .eq('id', serviceId)
            .single();
        if (fetchError) {
            throw fetchError;
        }
        return res.status(201).json({
            success: true,
            message: 'Service created successfully',
            data: completeService
        });
    }
    catch (error) {
        console.error('Error creating service:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create service',
            error: error.message
        });
    }
});
exports.addSellerservice = addSellerservice;
// export const getAllServices = async (req: Request, res: Response): Promise<any> => {
//   try {
//     const page = parseInt(req.query.page as string) || 1;
//     const limit = parseInt(req.query.limit as string) || 10;
//     const offset = (page - 1) * limit;
//     const { data: services, error: servicesError, count } = await supabase
//       .from('services')
//       .select('*', { count: 'exact' })
//       .eq('is_active', true)
//       .range(offset, offset + limit - 1)
//       .order('created_at', { ascending: false });
//     if (servicesError) throw servicesError;
//     const sellerIds = services.map(service => service.seller_id);
//     const { data: sellers, error: sellersError } = await supabase
//       .from('profiles')
//       .select('*')
//       .in('id', sellerIds);
//     if (sellersError) throw sellersError;
//     const sellerMap = new Map(sellers.map(seller => [seller.id, seller]));
//     const { data: servicePlans, error: plansError } = await supabase
//       .from('services_plan')
//       .select('*')
//       .in('service_id', services.map(s => s.id));
//     if (plansError) throw plansError;
//     const plansMap = new Map();
//     servicePlans.forEach(plan => {
//       if (!plansMap.has(plan.service_id)) {
//         plansMap.set(plan.service_id, []);
//       }
//       plansMap.get(plan.service_id).push(plan);
//     });
//     const formattedServices = services.map(service => ({
//       ...service,
//       seller: sellerMap.get(service.seller_id) || null,
//       services_plan: plansMap.get(service.id) || []
//     }));
//     res.status(200).json({
//       success: true,
//       data: formattedServices,
//       pagination: {
//         currentPage: page,
//         totalPages: Math.ceil((count || 0) / limit),
//         totalItems: count,
//         itemsPerPage: limit
//       }
//     });
//   } catch (error: any) {
//     console.error('Error fetching services:', error.message);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch services',
//       error: error.message
//     });
//   }
// };
const getAllServices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        // First, get all services without pagination to apply personalized sorting
        const { data: allServices, error: allServicesError } = yield app_1.supabase
            .from('services')
            .select('*')
            .eq('is_active', true);
        if (allServicesError)
            throw allServicesError;
        let finalServices = allServices;
        let userHasPreferences = false;
        let topKeywords = [];
        // Apply personalized sorting if user is authenticated
        if (userId && allServices && allServices.length > 0) {
            // Get user preferences
            const { data: userPreferences } = yield app_1.supabase
                .from('user_preferences')
                .select('service_keywords')
                .eq('user_id', userId)
                .single();
            // Check if user has service preferences
            userHasPreferences = (userPreferences === null || userPreferences === void 0 ? void 0 : userPreferences.service_keywords) !== null &&
                (userPreferences === null || userPreferences === void 0 ? void 0 : userPreferences.service_keywords) !== undefined &&
                typeof (userPreferences === null || userPreferences === void 0 ? void 0 : userPreferences.service_keywords) === 'object' &&
                Object.keys(userPreferences.service_keywords).length > 0;
            const userKeywords = (userPreferences === null || userPreferences === void 0 ? void 0 : userPreferences.service_keywords) || {};
            if (userHasPreferences) {
                // Get top 5 most used keywords from user preferences
                topKeywords = Object.entries(userKeywords)
                    .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
                    .slice(0, 5)
                    .map(([keyword]) => keyword.toLowerCase().trim());
                // Calculate scores for each service based on user preferences
                const servicesWithScores = allServices.map(service => {
                    const serviceKeywords = service.keywords || [];
                    let preferenceScore = 0;
                    let topKeywordMatch = false;
                    // Calculate preference score based on user's keyword history
                    serviceKeywords.forEach((keyword) => {
                        const cleanKeyword = keyword.toLowerCase().trim();
                        const keywordScore = userKeywords[cleanKeyword] || 0;
                        preferenceScore += keywordScore;
                        // Check if this service matches any of the top 5 keywords
                        if (topKeywords.includes(cleanKeyword)) {
                            topKeywordMatch = true;
                            // Bonus points for matching top keywords
                            preferenceScore += keywordScore * 2;
                        }
                    });
                    // Calculate newness score (more recent = higher score)
                    const newnessScore = new Date(service.created_at).getTime();
                    return Object.assign(Object.assign({}, service), { preferenceScore,
                        newnessScore,
                        topKeywordMatch // Flag for top keyword matches
                     });
                });
                // ALGORITHM: Prioritize services with top keywords first, then 50-30-20 distribution
                const totalServices = allServices.length;
                // 1. FIRST: Get services that match top 5 keywords (highest priority)
                const topKeywordServices = servicesWithScores
                    .filter(service => service.topKeywordMatch)
                    .sort((a, b) => b.preferenceScore - a.preferenceScore);
                // 2. Then apply 50-30-20 distribution to remaining services
                const remainingServices = servicesWithScores
                    .filter(service => !service.topKeywordMatch);
                const remainingCount = totalServices - topKeywordServices.length;
                const preferredCount = Math.floor(remainingCount * 0.5);
                const newCount = Math.floor(remainingCount * 0.3);
                const mixedCount = Math.floor(remainingCount * 0.2);
                // 2a. Get 50% based on user preferences from remaining
                const preferredServices = remainingServices
                    .filter(service => service.preferenceScore > 0)
                    .sort((a, b) => b.preferenceScore - a.preferenceScore);
                const selectedPreferred = preferredServices.slice(0, preferredCount);
                // 2b. Get 30% based on newness from remaining
                const newServices = remainingServices
                    .filter(service => !selectedPreferred.includes(service))
                    .sort((a, b) => b.newnessScore - a.newnessScore);
                const selectedNew = newServices.slice(0, newCount);
                // 2c. Get 20% based on mixed factors from remaining
                const mixedServices = remainingServices
                    .filter(service => !selectedPreferred.includes(service) && !selectedNew.includes(service));
                const selectedMixed = mixedServices.slice(0, mixedCount);
                // Combine all selected services: TOP KEYWORD SERVICES FIRST, then others
                finalServices = [
                    ...topKeywordServices, // Highest priority: services matching top keywords
                    ...selectedPreferred, // Then preferred services
                    ...selectedNew, // Then new services
                    ...selectedMixed // Then mixed services
                ];
                // If we don't have enough services, fill with any remaining
                if (finalServices.length < totalServices) {
                    const allRemaining = servicesWithScores.filter(service => !finalServices.includes(service));
                    finalServices = [...finalServices, ...allRemaining.slice(0, totalServices - finalServices.length)];
                }
            }
        }
        // Now apply pagination to the final sorted services
        const paginatedServices = finalServices.slice(offset, offset + limit);
        // Get additional data for the paginated services
        const sellerIds = paginatedServices.map(service => service.seller_id);
        const serviceIds = paginatedServices.map(service => service.id);
        const { data: sellers, error: sellersError } = yield app_1.supabase
            .from('profiles')
            .select('*')
            .in('id', sellerIds);
        if (sellersError)
            throw sellersError;
        const sellerMap = new Map(sellers.map(seller => [seller.id, seller]));
        const { data: servicePlans, error: plansError } = yield app_1.supabase
            .from('services_plan')
            .select('*')
            .in('service_id', serviceIds);
        if (plansError)
            throw plansError;
        const plansMap = new Map();
        servicePlans.forEach(plan => {
            if (!plansMap.has(plan.service_id)) {
                plansMap.set(plan.service_id, []);
            }
            plansMap.get(plan.service_id).push(plan);
        });
        // Format the final response
        const formattedServices = paginatedServices.map(service => ({
            id: service.id,
            seller_id: service.seller_id,
            service_title: service.service_title,
            service_category: service.service_category,
            description: service.description,
            keywords: service.keywords,
            thumbnails: service.thumbnails,
            created_at: service.created_at,
            updated_at: service.updated_at,
            is_active: service.is_active,
            bookingcall_array: service.bookingcall_array,
            seller: sellerMap.get(service.seller_id) || null,
            services_plan: plansMap.get(service.id) || [],
            // Include scoring info for debugging (optional)
            _score: service.preferenceScore,
            _top_keyword_match: service.topKeywordMatch
        }));
        res.status(200).json({
            success: true,
            data: formattedServices,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(finalServices.length / limit),
                totalItems: finalServices.length,
                itemsPerPage: limit
            },
            metadata: {
                personalized: !!userId && userHasPreferences,
                user_has_preferences: userHasPreferences,
                top_keywords: topKeywords,
                algorithm_applied: userHasPreferences ? "top-keywords-first with 50-30-20 sorting" : "default sorting",
                sorting_breakdown: userHasPreferences ? {
                    top_keyword_services: finalServices.filter(s => s.topKeywordMatch).length,
                    preferred_services: finalServices.filter(s => s.preferenceScore > 0 && !s.topKeywordMatch).length,
                    new_services: finalServices.filter(s => s.preferenceScore === 0 && !s.topKeywordMatch).length,
                    mixed_services: finalServices.length - finalServices.filter(s => s.preferenceScore >= 0 && !s.topKeywordMatch).length
                } : null
            }
        });
    }
    catch (error) {
        console.error('Error fetching services:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch services',
            error: error.message
        });
    }
});
exports.getAllServices = getAllServices;
const getSellerServices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
        }
        // First get the seller's profile data
        const { data: profile, error: profileError } = yield app_1.supabase
            .from('profiles')
            .select('avatar_url, first_name, last_name, email')
            .eq('id', userId) // Using id which equals user_id
            .single();
        if (profileError)
            throw profileError;
        // Get services where seller_id matches the user's seller profile
        const { data: services, error: servicesError } = yield app_1.supabase
            .from('services')
            .select(`
        *,
        services_plan (*)
      `)
            .eq('seller_id', userId); // Assuming seller_id in services table is the user_id
        if (servicesError)
            throw servicesError;
        // Combine the data
        const responseData = services.map(service => (Object.assign(Object.assign({}, service), { seller_profile: profile })));
        res.status(200).json({
            success: true,
            data: responseData
        });
    }
    catch (error) {
        console.error('Error fetching seller services:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch seller services',
            error: error.message
        });
    }
});
exports.getSellerServices = getSellerServices;
const getServiceById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const serviceId = req.params.id;
        const { data: service, error: serviceError } = yield app_1.supabase
            .from('services')
            .select('*')
            .eq('id', serviceId)
            .maybeSingle();
        if (serviceError)
            throw serviceError;
        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service not found'
            });
        }
        // 2. Get all needed data in parallel
        const [{ data: plans, error: plansError }, { data: seller, error: sellerError }, { data: profile, error: profileError }, { data: relatedServices, error: relatedError }] = yield Promise.all([
            app_1.supabase
                .from('services_plan')
                .select('*')
                .eq('service_id', serviceId),
            app_1.supabase
                .from('sellers')
                .select('*')
                .eq('user_id', service.seller_id)
                .maybeSingle(),
            app_1.supabase
                .from('profiles')
                .select('avatar_url, first_name, last_name, email')
                .eq('id', service.seller_id)
                .maybeSingle(),
            app_1.supabase
                .from('services')
                .select(`
          id,
          service_title,
          thumbnails,
          service_category,
          services_plan (plan_price)
        `)
                .eq('seller_id', service.seller_id)
                .neq('id', serviceId)
                .limit(4)
        ]);
        // Handle errors
        if (plansError)
            throw plansError;
        if (sellerError)
            throw sellerError;
        if (profileError)
            throw profileError;
        if (relatedError)
            throw relatedError;
        // 3. Build the seller profile data
        const sellerProfile = seller ? Object.assign(Object.assign({}, seller), { avatar_url: (profile === null || profile === void 0 ? void 0 : profile.avatar_url) || null, first_name: (profile === null || profile === void 0 ? void 0 : profile.first_name) || null, last_name: (profile === null || profile === void 0 ? void 0 : profile.last_name) || null, email: (profile === null || profile === void 0 ? void 0 : profile.email) || null, city: seller.city || null, country: seller.country || null, rating: seller.rating || null, completed_jobs: seller.completed_jobs || null, response_time: seller.response_time || null }) : null;
        // 4. Process related services
        const formattedRelatedServices = (relatedServices || []).map(svc => {
            var _a, _b, _c, _d;
            return ({
                id: svc.id,
                service_title: svc.service_title,
                service_category: svc.service_category,
                thumbnails: ((_a = svc.thumbnails) === null || _a === void 0 ? void 0 : _a[0]) ? [svc.thumbnails[0]] : [],
                seller_profile: sellerProfile ? {
                    avatar_url: sellerProfile.avatar_url,
                    first_name: sellerProfile.first_name,
                    last_name: sellerProfile.last_name,
                    user_id: service.seller_id
                } : null,
                price: ((_b = svc.services_plan) === null || _b === void 0 ? void 0 : _b.reduce((min, p) => Math.min(min, p.plan_price), ((_d = (_c = svc.services_plan) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.plan_price) || 0)) || 0
            });
        });
        // 5. Build final response
        const responseData = Object.assign(Object.assign({}, service), { services_plan: plans || [], seller_profile: sellerProfile, related_services: formattedRelatedServices });
        res.status(200).json({
            success: true,
            data: responseData
        });
    }
    catch (error) {
        console.error('Error fetching service:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch service',
            error: error.message
        });
    }
});
exports.getServiceById = getServiceById;
const generateSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { niche, slogan, languages, country, city } = req.body;
        if (!niche || !slogan || !languages) {
            res.status(400).json({
                success: false,
                message: 'Missing required fields: niche, slogan, and languages are required'
            });
            return;
        }
        if (!Array.isArray(languages) || languages.length === 0) {
            res.status(400).json({
                success: false,
                message: 'Languages must be a non-empty array'
            });
            return;
        }
        for (const lang of languages) {
            if (!lang.proficiency) {
                res.status(400).json({
                    success: false,
                    message: 'Each language must have a proficiency level'
                });
                return;
            }
        }
        const aiDescription = yield (0, openai_service_1.generateAIDescription)({
            niche,
            slogan,
            languages,
            country: country || undefined,
            city: city || undefined
        });
        res.status(200).json({
            success: true,
            data: {
                description: aiDescription
            }
        });
    }
    catch (error) {
        console.error('Error in generateAIResponse controller:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while generating AI description'
        });
    }
});
exports.generateSummary = generateSummary;
// --------------- 2FA STATUS -----------------
const get2FAStatusController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { data: profile, error } = yield app_1.supabase
            .from('profiles')
            .select('two_factor_enabled, two_factor_setup_at, backup_codes')
            .eq('id', userId)
            .single();
        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching 2FA status',
                error: error.message
            });
        }
        const profileData = profile;
        const unusedBackupCodes = profileData.backup_codes
            ? profileData.backup_codes.filter((code) => code.used === false).length
            : 0;
        return res.status(200).json({
            success: true,
            data: {
                enabled: profileData.two_factor_enabled || false,
                setupAt: profileData.two_factor_setup_at,
                backupCodesCount: unusedBackupCodes
            }
        });
    }
    catch (error) {
        console.error('2FA status error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});
exports.get2FAStatusController = get2FAStatusController;
// --------------- 2FA SETUP -----------------
const setup2FAController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const userEmail = (_b = req.user) === null || _b === void 0 ? void 0 : _b.email;
        const appName = process.env.APP_NAME || 'NIRVANA';
        const secret = speakeasy_1.default.generateSecret({
            name: `${appName}:${userEmail}`,
            issuer: appName,
            length: 32
        });
        const { error } = yield app_1.supabase
            .from('profiles')
            .update({
            two_factor_temp_secret: secret.base32,
            updated_at: new Date().toISOString()
        })
            .eq('id', userId);
        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Error storing 2FA secret',
                error: error.message
            });
        }
        const qrCodeDataURL = yield qrcode_1.default.toDataURL(secret.otpauth_url);
        return res.status(200).json({
            success: true,
            data: {
                secret: secret.base32,
                qrCode: qrCodeDataURL,
                manualEntryKey: secret.base32,
                backupCodes: []
            }
        });
    }
    catch (error) {
        console.error('2FA setup error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error generating 2FA setup',
            error: error.message
        });
    }
});
exports.setup2FAController = setup2FAController;
// --------------- VERIFY 2FA SETUP -----------------
const verify2FASetupController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { token } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!token || token.length !== 6) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid 6-digit code'
            });
        }
        const { data: profile, error } = yield app_1.supabase
            .from('profiles')
            .select('two_factor_temp_secret')
            .eq('id', userId)
            .single();
        if (error || !profile.two_factor_temp_secret) {
            return res.status(400).json({
                success: false,
                message: 'No setup in progress. Please start 2FA setup again.'
            });
        }
        const verified = speakeasy_1.default.totp.verify({
            secret: profile.two_factor_temp_secret,
            encoding: 'base32',
            token: token,
            window: 1
        });
        if (!verified) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code'
            });
        }
        const backupCodes = generateBackupCodes();
        return res.status(200).json({
            success: true,
            message: 'Code verified successfully',
            data: {
                backupCodes: backupCodes
            }
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error verifying 2FA code',
            error: error.message
        });
    }
});
exports.verify2FASetupController = verify2FASetupController;
// --------------- ENABLE 2FA -----------------
const enable2FAController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { backupCodes } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { data: profile, error: fetchError } = yield app_1.supabase
            .from('profiles')
            .select('two_factor_temp_secret')
            .eq('id', userId)
            .single();
        if (fetchError || !profile.two_factor_temp_secret) {
            return res.status(400).json({
                success: false,
                message: 'No verified setup found. Please complete setup first.'
            });
        }
        const { error } = yield app_1.supabase
            .from('profiles')
            .update({
            two_factor_enabled: true,
            two_factor_secret: profile.two_factor_temp_secret,
            two_factor_temp_secret: null,
            two_factor_setup_at: new Date().toISOString(),
            backup_codes: backupCodes.map((code) => ({ code, used: false })),
            updated_at: new Date().toISOString()
        })
            .eq('id', userId);
        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Error enabling 2FA',
                error: error.message
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Two-factor authentication enabled successfully'
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error enabling 2FA',
            error: error.message
        });
    }
});
exports.enable2FAController = enable2FAController;
// --------------- DISABLE 2FA -----------------
const disable2FAController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { password, twoFactorCode } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!password && !twoFactorCode) {
            return res.status(400).json({
                success: false,
                message: 'Please provide either password or 2FA code for verification'
            });
        }
        if (twoFactorCode) {
            const { data: profile } = yield app_1.supabase
                .from('profiles')
                .select('two_factor_secret')
                .eq('id', userId)
                .single();
            const verified = speakeasy_1.default.totp.verify({
                secret: profile === null || profile === void 0 ? void 0 : profile.two_factor_secret,
                encoding: 'base32',
                token: twoFactorCode,
                window: 1
            });
            if (!verified) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid 2FA code'
                });
            }
        }
        const { error } = yield app_1.supabase
            .from('profiles')
            .update({
            two_factor_enabled: false,
            two_factor_secret: null,
            two_factor_temp_secret: null,
            backup_codes: null,
            updated_at: new Date().toISOString()
        })
            .eq('id', userId);
        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Error disabling 2FA',
                error: error.message
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Two-factor authentication disabled successfully'
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error disabling 2FA',
            error: error.message
        });
    }
});
exports.disable2FAController = disable2FAController;
// --------------- VERIFY 2FA LOGIN -----------------
const verify2FALoginController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, token, deviceInfo } = req.body;
        if (!token || token.length !== 6) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid 6-digit code'
            });
        }
        const { data: profile, error } = yield app_1.supabase
            .from('profiles')
            .select('two_factor_secret, two_factor_enabled')
            .eq('id', userId)
            .single();
        if (error || !profile.two_factor_enabled) {
            return res.status(400).json({
                success: false,
                message: 'Two-factor authentication not enabled'
            });
        }
        const verified = speakeasy_1.default.totp.verify({
            secret: profile.two_factor_secret,
            encoding: 'base32',
            token: token,
            window: 1
        });
        if (!verified) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code'
            });
        }
        if (deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.rememberDevice) {
            const deviceId = crypto_1.default.randomUUID();
            yield app_1.supabase
                .from('trusted_devices')
                .insert({
                user_id: userId,
                device_id: deviceId,
                device_name: deviceInfo.deviceName || 'Unknown Device',
                device_type: deviceInfo.deviceType || 'web',
                user_agent: deviceInfo.userAgent,
                ip_address: req.ip,
                created_at: new Date().toISOString()
            });
        }
        return res.status(200).json({
            success: true,
            message: '2FA verification successful'
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error verifying 2FA',
            error: error.message
        });
    }
});
exports.verify2FALoginController = verify2FALoginController;
// --------------- VERIFY BACKUP CODE -----------------
const verify2FABackupCodeController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, backupCode } = req.body;
        if (!backupCode) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a backup code'
            });
        }
        const { data: profile, error } = yield app_1.supabase
            .from('profiles')
            .select('backup_codes')
            .eq('id', userId)
            .single();
        if (error || !profile.backup_codes) {
            return res.status(400).json({
                success: false,
                message: 'No backup codes found'
            });
        }
        const codeIndex = profile.backup_codes.findIndex((bc) => bc.code === backupCode && !bc.used);
        if (codeIndex === -1) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or already used backup code'
            });
        }
        const updatedCodes = [...profile.backup_codes];
        updatedCodes[codeIndex].used = true;
        yield app_1.supabase
            .from('profiles')
            .update({
            backup_codes: updatedCodes,
            updated_at: new Date().toISOString()
        })
            .eq('id', userId);
        return res.status(200).json({
            success: true,
            message: 'Backup code verified successfully'
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error verifying backup code',
            error: error.message
        });
    }
});
exports.verify2FABackupCodeController = verify2FABackupCodeController;
// --------------- REGENERATE BACKUP CODES -----------------
const regenerateBackupCodesController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { twoFactorCode } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!twoFactorCode) {
            return res.status(400).json({
                success: false,
                message: 'Please provide your 2FA code to regenerate backup codes'
            });
        }
        const { data: profile, error } = yield app_1.supabase
            .from('profiles')
            .select('two_factor_secret, two_factor_enabled')
            .eq('id', userId)
            .single();
        if (error || !profile.two_factor_enabled) {
            return res.status(400).json({
                success: false,
                message: 'Two-factor authentication not enabled'
            });
        }
        const verified = speakeasy_1.default.totp.verify({
            secret: profile.two_factor_secret,
            encoding: 'base32',
            token: twoFactorCode,
            window: 1
        });
        if (!verified) {
            return res.status(400).json({
                success: false,
                message: 'Invalid 2FA code'
            });
        }
        const newBackupCodes = generateBackupCodes();
        yield app_1.supabase
            .from('profiles')
            .update({
            backup_codes: newBackupCodes.map((code) => ({ code, used: false })),
            updated_at: new Date().toISOString()
        })
            .eq('id', userId);
        return res.status(200).json({
            success: true,
            message: 'Backup codes regenerated successfully',
            data: {
                backupCodes: newBackupCodes
            }
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error regenerating backup codes',
            error: error.message
        });
    }
});
exports.regenerateBackupCodesController = regenerateBackupCodesController;
// --------------- GET TRUSTED DEVICES -----------------
const getTrustedDevicesController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { data: devices, error } = yield app_1.supabase
            .from('trusted_devices')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching trusted devices',
                error: error.message
            });
        }
        return res.status(200).json({
            success: true,
            data: devices
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error fetching trusted devices',
            error: error.message
        });
    }
});
exports.getTrustedDevicesController = getTrustedDevicesController;
// --------------- REMOVE TRUSTED DEVICE -----------------
const removeTrustedDeviceController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { deviceId } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { error } = yield app_1.supabase
            .from('trusted_devices')
            .delete()
            .eq('device_id', deviceId)
            .eq('user_id', userId);
        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Error removing trusted device',
                error: error.message
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Trusted device removed successfully'
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error removing trusted device',
            error: error.message
        });
    }
});
exports.removeTrustedDeviceController = removeTrustedDeviceController;
// --------------- HELPER FUNCTIONS -----------------
function generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < 8; i++) {
        const code = crypto_1.default.randomBytes(4).toString('hex').toUpperCase();
        codes.push(code);
    }
    return codes;
}
const getUnapprovedUsersController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: users, error } = yield app_1.supabase
            .from("profiles")
            .select("*")
            .eq("approved_status", false)
            .eq("is_active", true)
            .order("created_at", { ascending: false });
        if (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch unapproved users",
                error: error.message,
            });
        }
        return res.status(200).json({
            success: true,
            data: users || [],
        });
    }
    catch (err) {
        console.error("Get unapproved users error:", err);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});
exports.getUnapprovedUsersController = getUnapprovedUsersController;
const approveUserController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required",
            });
        }
        const { data: user, error: fetchError } = yield app_1.supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .single();
        if (fetchError || !user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }
        if (user.approved_status) {
            return res.status(400).json({
                success: false,
                message: "User is already approved",
            });
        }
        const { error: updateError } = yield app_1.supabase
            .from("profiles")
            .update({ approved_status: true })
            .eq("id", userId);
        if (updateError) {
            return res.status(500).json({
                success: false,
                message: "Failed to approve user",
                error: updateError.message,
            });
        }
        return res.status(200).json({
            success: true,
            message: "User approved successfully",
        });
    }
    catch (err) {
        console.error("Approve user error:", err);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});
exports.approveUserController = approveUserController;
