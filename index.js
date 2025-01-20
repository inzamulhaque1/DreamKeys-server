const express = require("express");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken')
const app = express();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

// Middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Server is running...");
});



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.k3e8u.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.k3e8u.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// const uri = 'mongodb://localhost:27017';




// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const usersCollection = client.db("DreamKeys").collection("users")
        const propertiesCollection = client.db("DreamKeys").collection("properties");
        const wishlistCollection = client.db("DreamKeys").collection("wishlist");
        const bidsCollection = client.db("DreamKeys").collection("bids");
        const reviewsCollection = client.db("DreamKeys").collection("reviews");
        const paymentCollection = client.db("DreamKeys").collection("payment");
        


        // Jwt related apis

        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1hr'
            })
            res.send({ token })
        })


        // app.post('/jwt', async (req, res) => {
        //     const user = req.body
        //     const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
        //     res
        //         .cookie('token', token, {
        //             httpOnly: true,
        //             secure: process.env.NODE_ENV==='production',
        //         })
        //         .send({ success: true })
        // })

        // middlewares
        const verifyToken = (req, res, next) => {
            // console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            const token = req.headers.authorization.split(' ')[1]
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded
                next()
            })

        }

        // use verify admin after verify token

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            const isAdmin = user?.role === 'admin'
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next()
        }



        //!--- USERS ---!//

        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            user.role = user.role || "user";

            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: 'User already exists', insertedID: null });
            }

            const { photoURL } = user;
            if (photoURL) {
                user.photoURL = photoURL;
            }

            const result = await usersCollection.insertOne(user);

            if (result.insertedId) {
                res.send({
                    message: 'User successfully registered',
                    insertedID: result.insertedId
                });
            } else {
                res.status(500).send({ message: 'Failed to register user' });
            }
        });


        app.get('/users/role', async (req, res) => {
            const email = req.query.email; // Assuming email is sent as a query parameter
            const user = await usersCollection.findOne({ email });
            console.log(user);
            res.send({ role: user?.role || "user" });
            
        });

        app.get('/users', async (req, res) => {
            const email = req.query.email;
            if (email) {
                const user = await usersCollection.findOne({ email }); // Get a single user
                return res.send(user || {});
            }
            res.status(400).send({ error: "Email is required" });
        });


        app.patch('/users/:id/role', (req, res) => {
            const userId = req.params.id;
            const { role } = req.body;

            if (!role) {
                return res.status(400).send({ message: 'Role is required' });
            }

            const filter = { _id: new ObjectId(userId) }; // Use ObjectId
            const updateDoc = { $set: { role } };

            usersCollection.updateOne(filter, updateDoc)
                .then(result => {
                    if (result.modifiedCount > 0) {
                        res.send({ message: 'User role updated successfully' });
                    } else {
                        res.status(404).send({ message: 'User not found or role already set' });
                    }
                });
        });


        app.delete('/users/:id', verifyToken, verifyAdmin, (req, res) => {
            const userId = req.params.id;

            const filter = { _id: new ObjectId(userId) }; // Use ObjectId

            usersCollection.deleteOne(filter)
                .then(result => {
                    if (result.deletedCount > 0) {
                        res.send({ message: 'User deleted successfully' });
                    } else {
                        res.status(404).send({ message: 'User not found' });
                    }
                });
        });
        app.patch('/users/:userId/fraud', async (req, res) => {
            const { userId } = req.params;

            if (!ObjectId.isValid(userId)) {
                return res.status(400).send({ message: 'Invalid user ID.' });
            }

            try {
                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(userId) },
                    { $set: { isFraud: true } }
                );
                if (result.modifiedCount > 0) {
                    res.status(200).send({ message: 'User marked as fraud successfully.' });
                } else {
                    res.status(404).send({ message: 'User not found.' });
                }
            } catch (error) {
                console.error('Error:', error);
                res.status(500).send({ message: 'Internal server error.', error });
            }
        });


        app.delete('/properties/agent/:userId', async (req, res) => {
            const { userId } = req.params;

            const result = await propertiesCollection.deleteMany({ agentId: userId }); // Adjust field based on your schema
            if (result.deletedCount > 0) {
                res.send({ message: 'Agent properties deleted successfully' });
            } else {
                res.status(404).send({ message: 'No properties found for the given agent' });
            }
        });








        // ! Property ! //

        // Add new property
        app.post('/properties', async (req, res) => {
            const propertyData = req.body;
            const verificationStatus = "pending"; // Default status

            // Add the property to the database
            const result = await propertiesCollection.insertOne({
                ...propertyData,
                verificationStatus
            });

            if (result.insertedId) {
                res.send({
                    message: 'Property added successfully',
                    insertedID: result.insertedId
                });
            } else {
                res.status(500).send({ message: 'Failed to add property' });
            }
        });


        // Update property
        app.patch('/properties/:id', verifyToken, async (req, res) => {
            const { id } = req.params;
            let updatedPropertyData = req.body;

            // Exclude the _id field from the update data if it exists
            delete updatedPropertyData._id;

            try {
                const result = await propertiesCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updatedPropertyData }
                );

                if (result.modifiedCount > 0) {
                    res.send({ message: 'Property updated successfully' });
                } else {
                    res.status(404).send({ message: 'Property not found or no changes made' });
                }
            } catch (error) {
                res.status(500).send({ message: 'Error updating property', error });
            }
        });

        // Get all properties (filter by agentEmail if provided)
        app.get('/properties', async (req, res) => {
            const { agentEmail } = req.query; // Get the agentEmail from query parameters

            let query = {};
            if (agentEmail) {
                query.agentEmail = agentEmail; // Filter properties by the agent's email
            }

            const properties = await propertiesCollection.find(query).toArray();
            res.send(properties);
        });


        // Get a single property by ID
        app.get('/properties/:id', async (req, res) => {
            const { id } = req.params;
            const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
            if (property) {
                res.send(property);
            } else {
                res.status(404).send({ message: 'Property not found' });
            }
        });

        // Admin verifies property
        app.patch('/properties/:id/verify', verifyToken, async (req, res) => {
            const { id } = req.params;
            const { verificationStatus } = req.body;

            if (!['verified', 'rejected'].includes(verificationStatus)) {
                return res.status(400).send({ message: 'Invalid verification status' });
            }

            const result = await propertiesCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { verificationStatus } }
            );

            if (result.modifiedCount > 0) {
                res.send({ message: 'Property verification status updated' });
            } else {
                res.status(404).send({ message: 'Property not found or already updated' });
            }
        });

        // Delete property by ID
        app.delete('/properties/:id', verifyToken, async (req, res) => {
            const { id } = req.params;
            const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });

            if (result.deletedCount > 0) {
                res.send({ message: 'Property deleted successfully' });
            } else {
                res.status(404).send({ message: 'Property not found' });
            }
        });

        // Update property to be advertised
        app.patch('/properties/:id/advertise', verifyToken, async (req, res) => {
            const { id } = req.params;
        
            const result = await propertiesCollection.updateOne(
                { _id: new ObjectId(id) },
                { 
                    $set: { 
                        isAdvertised: true, 
                        updatedAt: new Date() 
                    } 
                }
            );
        
            if (result.modifiedCount > 0) {
                res.send({ message: 'Property advertised successfully' });
            } else {
                res.status(404).send({ message: 'Property not found or already advertised' });
            }
        });
        

        // Remove property from being advertised
        app.patch('/properties/:id/remove-advertise', verifyToken, async (req, res) => {
            const { id } = req.params;

            try {
                const result = await propertiesCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { isAdvertised: false } }
                );

                if (result.modifiedCount > 0) {
                    res.send({ message: 'Property advertisement removed successfully' });
                } else {
                    res.status(404).send({ message: 'Property not found or not advertised' });
                }
            } catch (error) {
                res.status(500).send({ message: 'Error removing advertisement', error });
            }
        });


        // Report a property
app.post('/properties/:id/report', async (req, res) => {
    const { id } = req.params;
    const { reporterName, reporterEmail, reportDescription } = req.body;

    const reportData = {
        propertyId: new ObjectId(id),
        reporterName,
        reporterEmail,
        reportDescription,
    };

    try {
        const result = await reportedPropertiesCollection.insertOne(reportData);
        res.send({ message: 'Property reported successfully', reportId: result.insertedId });
    } catch (error) {
        res.status(500).send({ message: 'Failed to report property', error });
    }
});








        // ! WISHLIST

        // Add a property to the wishlist
        app.post('/wishlist', verifyToken, async (req, res) => {
            const { propertyId } = req.body;
            const userEmail = req.decoded.email;

            const property = await propertiesCollection.findOne({ _id: new ObjectId(propertyId) });
            delete property._id;

            const wishlistItem = {
                userEmail,
                propertyId,
                addedAt: new Date(),
                ...property
            };


            const result = await wishlistCollection.insertOne(wishlistItem);
            res.send({ message: 'Added to wishlist', result });
        });

        // Fetch all wishlist items for a user
        app.get('/wishlist', verifyToken, async (req, res) => {
            const userEmail = req.decoded.email;

            const wishlistItems = await wishlistCollection
                .find({ userEmail })
                .toArray();

            res.send(wishlistItems);
        });

        // Get a single wishlist by ID
        app.get('/wishlist/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const userEmail = req.decoded.email;
            const wishlistItems = await wishlistCollection.findOne({
                _id: new ObjectId(id),
                userEmail
            })
            res.send(wishlistItems);
        });

        // Remove a property from the wishlist
        app.delete('/wishlist/:id', verifyToken, async (req, res) => {
            const { id } = req.params;
            const userEmail = req.decoded.email;

            const result = await wishlistCollection.deleteOne({
                _id: new ObjectId(id),
                userEmail
            });

            if (result.deletedCount > 0) {
                res.send({ message: 'Removed from wishlist' });
            } else {
                res.status(404).send({ message: 'Wishlist item not found' });
            }
        });

        // ! Bids

        app.post('/bids', verifyToken, async (req, res) => {
            const { propertyId,propertyTitle, agentEmail, offerAmount, buyerName, buyingDate } = req.body;

            const userEmail = req.decoded.email;

            const bidItem = {
                propertyId, propertyTitle, agentEmail, offerAmount, buyingDate, buyerName, buyerEmail: userEmail, status: 'pending'
            };

            const bid = await bidsCollection.insertOne(bidItem)
            if (!bid) {
                return res.status(404).send({ message: 'bid not found' });
            }

            res.send({ message: 'Bid Added Successfully', bid });
        });


        app.get('/bids/:email', async (req, res) => {
            const email = req.params.email;
            const bids = await bidsCollection.find({ buyerEmail: email }).toArray()
            const bidItems = await Promise.all(
                bids.map(async (bid) => {
                    const id = bid.propertyId;
                    const propertyItem = await propertiesCollection.findOne({ _id: new ObjectId(id) });
                    return {
                        ...propertyItem,
                        offerAmount: bid.offerAmount,
                        offerStatus: bid.status,
                        _id: new ObjectId(bid._id),
                        propertyId: bid.propertyId,


                    }
                }))

            res.send(bidItems)
        });
        app.get('/get-bid/:id', async (req, res) => {
            const id = req.params.id
            const bids = await bidsCollection.findOne({ _id: new ObjectId(id) })
            res.send(bids);
        });


        app.get('/agentBids/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const bids = await bidsCollection.find({ agentEmail: email }).toArray();

            const bidItems = await Promise.all(
                bids.map(async (bid) => {
                    const id = bid.propertyId;
                    const propertyItem = await propertiesCollection.findOne({ _id: new ObjectId(id) });
                    return {
                        ...propertyItem,
                        offerAmount: bid.offerAmount,
                        offerStatus: bid.status,
                        _id: new ObjectId(bid._id),
                        propertyId: bid.propertyId,
                        buyingDate: bid.buyingDate,
                        buyerName: bid.buyerName,
                        buyerEmail: bid.buyerEmail,

                    };
                })
            );

            res.send(bidItems);
        });


        app.patch('/bids/:id', verifyToken, async (req, res) => {
            const { id } = req.params;
            const { status } = req.body;
    

            const updatedBid = await bidsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: {  status } }
            );

            if (updatedBid.modifiedCount === 0) {
                return res.status(404).send({ message: 'Bid not found or already updated' });
            }

            res.send({ message: 'Bid status updated successfully', updatedBid });
        });



        //! Submit a review
        app.post('/reviews/:id', async (req, res) => {
            try {
                const { id } = req.params; // Property ID
                const { text, userId, username, userPhoto, reviewStatus } = req.body;

                if (!text || !userId || !username || !userPhoto) {
                    return res.status(400).json({ message: 'Missing review data' });
                }

                const review = {
                    propertyId: id,
                    text,
                    userId,
                    username,
                    userPhoto,
                    reviewStatus: 'pending', // Set default to 'pending'
                    createdAt: new Date(),
                };

                await reviewsCollection.insertOne(review);
                res.json({ message: 'Review submitted successfully' });
            } catch (error) {

                res.status(500).json({ error: 'Internal Server Error' });
            }
        });

        // Fetch all reviews
        app.get('/reviews', async (req, res) => {
            try {
                const reviews = await reviewsCollection.find().toArray();
                res.json(reviews);
            } catch (error) {

                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Fetch all reviews for a specific property by ID
        app.get('/reviews/:id', async (req, res) => {
            const propertyId = req.params.id;

            try {
                const reviews = await reviewsCollection.find({ propertyId }).toArray();
                res.json(reviews); // Send back the reviews for the given property ID
            } catch (error) {
                console.error('Error fetching reviews:', error);
                res.status(500).json({ message: 'Error fetching reviews', error });
            }
        });


        // Update review status
        app.put('/reviews/:id', async (req, res) => {
            const { id } = req.params;
            const { reviewStatus } = req.body;

            try {
                // Update the review status directly using updateOne
                const result = await reviewsCollection.updateOne(
                    { _id: new ObjectId(id) },  // Match by ObjectId
                    { $set: { reviewStatus } }  // Update the reviewStatus
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: 'Review not found' });
                }

                res.status(200).json({ message: 'Review status updated successfully' });
            } catch (error) {
                console.error("Error updating review status:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Fetch all reviews by a specific user
        app.get('/reviews/user/:userId', async (req, res) => {
            const userId = req.params.userId;

            try {
                const reviews = await reviewsCollection.find({ userId }).toArray();
                res.json(reviews); // Send back the reviews for the specific user
            } catch (error) {
                console.error('Error fetching user reviews:', error);
                res.status(500).json({ message: 'Error fetching user reviews', error });
            }
        });


        // Delete a review by reviewId
        app.delete('/reviews/:reviewId', async (req, res) => {
            const { reviewId } = req.params; // Review ID

            try {
                // Delete the review using the reviewId
                const result = await reviewsCollection.deleteOne({ _id: new ObjectId(reviewId) });

                if (result.deletedCount === 0) {
                    return res.status(404).json({ message: 'Review not found' });
                }

                // Return success response if the review is deleted
                res.status(200).json({ message: 'Review deleted successfully' });
            } catch (error) {
                console.error('Error deleting review:', error);
                res.status(500).json({ message: 'Internal Server Error', error });
            }
        });

        // Delete a review by reviewId
        app.delete('/reviews/:reviewId', async (req, res) => {
            const { reviewId } = req.params; // Review ID

            try {
                // Delete the review using the reviewId
                const result = await reviewsCollection.deleteOne({ _id: new ObjectId(reviewId) });

                if (result.deletedCount === 0) {
                    return res.status(404).json({ message: 'Review not found' });
                }

                // Return success response if the review is deleted
                res.status(200).json({ message: 'Review deleted successfully' });
            } catch (error) {
                console.error('Error deleting review:', error);
                res.status(500).json({ message: 'Internal Server Error', error });
            }
        });

        // Fetch latest 3 reviews for a specific property
        app.get('/reviews/:id', async (req, res) => {
            const propertyId = req.params.id;

            try {
                const reviews = await reviewsCollection
                    .find({ propertyId })
                    .sort({ createdAt: -1 }) // Sort by createdAt in descending order
                    .limit(3) // Limit to the latest 3 reviews
                    .toArray();
                res.json(reviews);
            } catch (error) {
                console.error('Error fetching reviews:', error);
                res.status(500).json({ message: 'Error fetching reviews', error });
            }
        });




        // ! Payment

        app.post("/create-checkout-session", async (req, res) => {
            const { amount } = req.body;

            try {
                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ["card"],
                    line_items: [
                        {
                            price_data: {
                                currency: "usd",
                                product_data: {
                                    name: "Property Purchase",
                                },
                                unit_amount: amount * 100, // Amount in cents
                            },
                            quantity: 1,
                        },
                    ],
                    mode: "payment",
                    success_url: `${YOUR_FRONTEND_URL}/payment-success`,
                    cancel_url: `${YOUR_FRONTEND_URL}/payment-cancel`,
                });

                res.json({ sessionId: session.id });
            } catch (error) {
                console.error("Error creating Stripe session:", error);
                res.status(500).send("Internal Server Error");
            }
        });


        app.post("/update-bid-status", async (req, res) => {
            const { bidId, transactionId } = req.body;

            try {
                await BidModel.updateOne(
                    { _id: bidId },
                    { $set: { status: "bought", transactionId } }
                );
                res.send("Status updated successfully");
            } catch (error) {
                console.error("Error updating status:", error);
                res.status(500).send("Internal Server Error");
            }
        });

// ! PAyment Intend // Payment intend

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body

      const amount = parseInt(price * 100)

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.post('/payments', async (req, res) => {
      const payment = req.body
      const paymentResult = await paymentCollection.insertOne(payment)

      // carefully delete each card from the cart
    //   console.log('payment info', payment);
    //   const query = {
    //     _id: {
    //       $in: payment.cartIds.map(id => new ObjectId(id))
    //     }
    //   }

    //   const deleteResult = await cartCollection.deleteMany(query)

    //   res.send({ paymentResult, deleteResult })

    })

    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email }
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ massage: 'forbidden access' })
      }
      const result = await paymentCollection.find(query).toArray()
      res.send(result)
    })






    app.get("/payments", async (req, res) => {
        const { agentEmail } = req.query;
      
        try {
          const query = agentEmail ? { agentEmail } : {};
          const payments = await paymentCollection.find(query).toArray();
          res.send(payments);
        } catch (error) {
          console.error("Error fetching payments:", error);
          res.status(500).send("Internal Server Error");
        }
      });
      





        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
        // Send a ping to confirm a successful connection

    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});