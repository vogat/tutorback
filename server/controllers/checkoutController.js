const stripe = require("../services/stripeClient");
const { initializeConnection } = require("../config/database");

const checkPurchasedCourses = async (userId, courseIds) => {
  try {
    const connection = await initializeConnection();
    const query = `SELECT course_id FROM purchased_courses WHERE user_id = ? AND course_id IN (${courseIds.map(() => '?').join(',')})`;
    const params = [userId, ...courseIds];

   

    const [results] = await connection.query(query, params);
    return results.map(result => result.course_id);
  } catch (err) {
    console.error("Error checking purchased courses:", err);
    throw new Error("Error checking purchased courses");
  }
};

const storeItems = new Map([
  [1, { priceInCents: 0, name: "Mastering Algebra Fundamentals"}],
  [2, { priceInCents: 2000, name: "Introduction to Creative Writing" }],
  [3, { priceInCents: 2000, name: "Exploring Physics for Beginners" }],
  [4, { priceInCents: 3000, name: "SAT Prep: Math and Reading" }],
  [5, { priceInCents: 4000, name: "Introduction to Public Speaking" }],
]);

exports.createCheckoutSession = async (req, res) => {
  try {

    const userId = req.user.id;
    if (!userId) {
      throw new Error("User ID is not defined. Ensure the user is authenticated.");
    }

    const courseIds = req.body.items.map((item) => item.id);

    // Check if any of the selected courses have already been purchased
    const purchasedCourseIds = await checkPurchasedCourses(userId, courseIds);


    if (purchasedCourseIds.length > 0) {
      return res.status(400).json({
        message: `You have already purchased courses with IDs: ${purchasedCourseIds.join(", ")}`,
        purchasedCourseIds,
      });
    }

    const lineItems = req.body.items.reduce((acc, item) => {
      const storeItem = storeItems.get(item.id);
      if (!storeItem) {
        console.error(`Item with id ${item.id} not found`);
        return acc; // Skip this item
      }
      acc.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: storeItem.name,
          },
          unit_amount: storeItem.priceInCents,
        },
        quantity: item.quantity,
      });
      return acc;
    }, []);

    if (lineItems.length === 0) {
      throw new Error("No valid items found for checkout.");
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: lineItems,
      success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}&course_id=${JSON.stringify(courseIds)}`,
      cancel_url: `${process.env.CLIENT_URL}/cancel`,
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error("Error creating checkout session:", e.message);
    res.status(500).json({ error: e.message });
  }
};
