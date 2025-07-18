import { Request, Response } from 'express';
import { supabase } from '../../app';
import Stripe from 'stripe';

// Initialize Stripe with proper error handling
const initializeStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  
  if (!secretKey || secretKey === 'sk_test_your_stripe_secret_key_here') {
    console.warn('⚠️  Stripe secret key not provided. Payment features will be disabled.');
    return null;
  }
  
  return new Stripe(secretKey, {
    apiVersion: '2025-06-30.basil',
  });
};

const stripe = initializeStripe();

// POST /api/enrollment/create-payment-intent
export const createPaymentIntent = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!stripe) {
      res.status(500).json({
        success: false,
        message: 'Payment processing is not available. Stripe is not configured.'
      });
      return;
    }

    const { courseId, paymentMethod, couponCode } = req.body;
    const userId = req.user?.id; // Assuming you have auth middleware that sets req.user

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // Check if user is already enrolled
    const { data: existingEnrollment } = await supabase
      .from('course_enrollments')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('is_active', true)
      .single();

    if (existingEnrollment) {
      res.status(400).json({
        success: false,
        message: 'You are already enrolled in this course'
      });
      return;
    }

    // Get course details
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, title, price, discounted_price, currency')
      .eq('id', courseId)
      .eq('status', 'published')
      .single();

    if (courseError || !course) {
      res.status(404).json({
        success: false,
        message: 'Course not found'
      });
      return;
    }

    // Calculate final price
    let finalPrice = course.discounted_price || course.price;
    let discountAmount = 0;
    let appliedCoupon = null;

    // Apply coupon if provided
    if (couponCode) {
      const couponResult = await applyCoupon(courseId, couponCode, finalPrice);
      if (couponResult.success) {
        finalPrice = couponResult.finalPrice;
        discountAmount = couponResult.discountAmount || 0;
        appliedCoupon = couponResult.coupon;
      }
    }

    // Convert to cents for Stripe
    const amountInCents = Math.round(finalPrice * 100);

    // Create order record
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

// ADD LOGGING HERE
console.log('Order insert payload:', {
  user_id: userId,
  order_number: orderNumber,
  status: 'pending',
  payment_method: paymentMethod,
  subtotal: course.discounted_price || course.price,
  discount_amount: discountAmount,
  total_amount: finalPrice,
  currency: course.currency || 'USD',
  coupon_code: appliedCoupon?.code
});
console.log('Types:', {
  user_id: typeof userId,
  order_number: typeof orderNumber,
  payment_method: typeof paymentMethod,
  subtotal: typeof (course.discounted_price || course.price),
  discount_amount: typeof discountAmount,
  total_amount: typeof finalPrice,
  currency: typeof (course.currency || 'USD'),
  coupon_code: typeof (appliedCoupon?.code)
});

// This is the insert you want to debug:
const { data: order, error: orderError } = await supabase
  .from('orders')
  .insert({
    user_id: userId,
    order_number: orderNumber,
    status: 'pending',
    payment_method: paymentMethod,
    subtotal: course.discounted_price || course.price,
    discount_amount: discountAmount,
    total_amount: finalPrice,
    currency: course.currency || 'USD',
    coupon_code: appliedCoupon?.code
  })
  .select()
  .single();
  
if (orderError || !order) {
  console.error('Order creation error:', orderError);
  res.status(500).json({
    success: false,
    message: 'Failed to create order',
    error: orderError // Add this for debugging, remove in production
  });
  return;
}

    // Create order item
    await supabase
      .from('order_items')
      .insert({
        order_id: order.id,
        course_id: courseId,
        course_title: course.title,
        price: course.price,
        discounted_price: course.discounted_price
      });

    // Create Stripe Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: course.currency?.toLowerCase() || 'usd',
      metadata: {
        order_id: order.id,
        course_id: courseId,
        user_id: userId
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Update order with payment intent ID
    await supabase
      .from('orders')
      .update({ payment_intent_id: paymentIntent.id })
      .eq('id', order.id);

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        amount: finalPrice,
        currency: course.currency || 'USD',
        courseId,
        orderId: order.id
      }
    });
  } catch (error: any) {
    console.error('Create payment intent error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create payment intent'
    });
  }
};

// POST /api/enrollment/confirm
export const confirmEnrollment = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!stripe) {
      res.status(500).json({
        success: false,
        message: 'Payment processing is not available. Stripe is not configured.'
      });
      return;
    }

    const { paymentIntentId, orderId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // Verify payment with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      res.status(400).json({
        success: false,
        message: 'Payment not confirmed'
      });
      return;
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items!inner (
          course_id,
          course_title
        )
      `)
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (orderError || !order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
      return;
    }

    // Update order status
    await supabase
      .from('orders')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        payment_details: {
          payment_intent_id: paymentIntentId,
          stripe_payment_method: paymentIntent.payment_method
        }
      })
      .eq('id', orderId);

    // Create enrollment for each course in the order
    const enrollments = [];
    for (const item of order.order_items) {
      // Check if enrollment already exists
      const { data: existingEnrollment } = await supabase
        .from('course_enrollments')
        .select('id')
        .eq('user_id', userId)
        .eq('course_id', item.course_id)
        .single();

      if (!existingEnrollment) {
        const { data: enrollment, error: enrollmentError } = await supabase
          .from('course_enrollments')
          .insert({
            user_id: userId,
            course_id: item.course_id,
            enrolled_at: new Date().toISOString(),
            is_active: true
          })
          .select()
          .single();

        if (enrollment) {
          enrollments.push(enrollment);
        }
      }
    }

    // Update course stats
    for (const item of order.order_items) {
      await updateCourseStats(item.course_id);
    }

    res.json({
      success: true,
      data: {
        order,
        enrollments,
        accessGranted: true
      },
      message: 'Enrollment completed successfully!'
    });
  } catch (error: any) {
    console.error('Confirm enrollment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to confirm enrollment'
    });
  }
};

// GET /api/enrollment/order-summary
export const getOrderSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { courseId, couponCode } = req.query;

    if (!courseId) {
      res.status(400).json({
        success: false,
        message: 'Course ID is required'
      });
      return;
    }

    // Get course details
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, title, price, discounted_price, currency')
      .eq('id', courseId)
      .eq('status', 'published')
      .single();

    if (courseError || !course) {
      res.status(404).json({
        success: false,
        message: 'Course not found'
      });
      return;
    }

    const originalPrice = course.price;
    let discountedPrice = course.discounted_price;
    let couponDiscountAmount = 0;
    let finalPrice = discountedPrice || originalPrice;

    // Apply coupon if provided
    if (couponCode && typeof couponCode === 'string') {
      const couponResult = await applyCoupon(courseId as string, couponCode, finalPrice);
      if (couponResult.success) {
        couponDiscountAmount = couponResult.discountAmount || 0;
        finalPrice = couponResult.finalPrice;
      }
    }

    const totalDiscountAmount = (originalPrice - (discountedPrice || originalPrice)) + couponDiscountAmount;

    res.json({
      success: true,
      data: {
        courseId,
        courseTitle: course.title,
        originalPrice,
        discountedPrice,
        couponCode: couponCode || null,
        discountAmount: totalDiscountAmount,
        subtotal: originalPrice,
        tax: 0, // Add tax calculation if needed
        total: finalPrice,
        currency: course.currency || 'USD'
      }
    });
  } catch (error: any) {
    console.error('Get order summary error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get order summary'
    });
  }
};

// GET /api/enrollment/check/:courseId
export const checkEnrollment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { courseId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const { data: enrollment, error } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('is_active', true)
      .single();

    res.json({
      success: true,
      data: {
        isEnrolled: !!enrollment,
        enrollment: enrollment || null
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check enrollment status'
    });
  }
};

// GET /api/enrollment/my-courses
export const getEnrolledCourses = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const { data: enrollments, error } = await supabase
      .from('course_enrollments')
      .select(`
        *,
        course:courses!inner (
          id,
          title,
          slug,
          description,
          short_description,
          thumbnail_url,
          price,
          discounted_price,
          currency,
          difficulty,
          duration_hours,
          instructor:profiles!courses_instructor_id_fkey (
            id,
            first_name,
            last_name,
            avatar_url
          ),
          category:course_categories!courses_category_id_fkey (
            id,
            name,
            slug
          )
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('enrolled_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: enrollments
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get enrolled courses'
    });
  }
};

// POST /api/enrollment/validate-coupon
export const validateCouponCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { courseId, couponCode } = req.body;

    if (!courseId || !couponCode) {
      res.status(400).json({
        success: false,
        message: 'Course ID and coupon code are required'
      });
      return;
    }

    // Get course price
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('price, discounted_price')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      res.status(404).json({
        success: false,
        message: 'Course not found'
      });
      return;
    }

    const currentPrice = course.discounted_price || course.price;
    const couponResult = await applyCoupon(courseId, couponCode, currentPrice);

    if (couponResult.success) {
      res.json({
        success: true,
        data: {
          coupon: couponResult.coupon,
          discountAmount: couponResult.discountAmount,
          finalPrice: couponResult.finalPrice
        },
        message: 'Coupon applied successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: couponResult.message
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to validate coupon'
    });
  }
};

// Helper function to apply coupon
async function applyCoupon(courseId: string, couponCode: string, currentPrice: number) {
  try {
    // Get coupon details
    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', couponCode.toUpperCase())
      .eq('is_active', true)
      .single();

    if (couponError || !coupon) {
      return { success: false, message: 'Invalid coupon code' };
    }

    // Check if coupon is expired
    const now = new Date();
    if (coupon.expires_at && new Date(coupon.expires_at) < now) {
      return { success: false, message: 'Coupon has expired' };
    }

    if (coupon.starts_at && new Date(coupon.starts_at) > now) {
      return { success: false, message: 'Coupon is not yet active' };
    }

    // Check usage limits
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
      return { success: false, message: 'Coupon usage limit exceeded' };
    }

    // Check minimum order amount
    if (coupon.minimum_order_amount && currentPrice < coupon.minimum_order_amount) {
      return { success: false, message: `Minimum order amount is $${coupon.minimum_order_amount}` };
    }

    // Check coupon scope
    if (coupon.scope === 'specific_courses') {
      const { data: couponCourse } = await supabase
        .from('coupon_courses')
        .select('id')
        .eq('coupon_id', coupon.id)
        .eq('course_id', courseId)
        .single();

      if (!couponCourse) {
        return { success: false, message: 'Coupon is not valid for this course' };
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.type === 'percentage') {
      discountAmount = (currentPrice * coupon.value) / 100;
      if (coupon.maximum_discount_amount) {
        discountAmount = Math.min(discountAmount, coupon.maximum_discount_amount);
      }
    } else {
      discountAmount = Math.min(coupon.value, currentPrice);
    }

    const finalPrice = Math.max(0, currentPrice - discountAmount);

    return {
      success: true,
      coupon,
      discountAmount: discountAmount || 0,
      finalPrice: finalPrice || 0
    };
  } catch (error) {
    return { success: false, message: 'Failed to apply coupon' };
  }
}

// Helper function to update course stats
async function updateCourseStats(courseId: string) {
  try {
    // Get enrollment count
    const { count: enrollmentCount } = await supabase
      .from('course_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', courseId)
      .eq('is_active', true);

    // Update course stats
    await supabase
      .from('course_stats')
      .upsert({
        course_id: courseId,
        total_enrollments: enrollmentCount || 0,
        last_updated: new Date().toISOString()
      }, {
        onConflict: 'course_id'
      });
  } catch (error) {
    console.error('Failed to update course stats:', error);
  }
}
