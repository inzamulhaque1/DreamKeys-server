require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken')
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Server is running...");
});




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.k3e8u.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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


        // Jwt related apis

        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1hr'
            })
            res.send({ token })
        })

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
            const user = await userCollection.findOne(query)
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


        app.delete('/users/:id', (req, res) => {
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

        // ! WISHLIST

        // Add a property to the wishlist
        app.post('/wishlist', verifyToken, async (req, res) => {
            const { propertyId } = req.body;
            const userEmail = req.decoded.email;

            console.log(propertyId);
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
        app.get('/wishlist/:id',verifyToken, async (req, res) => {
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
            const { propertyId, agentEmail, offerAmount , buyerName } = req.body;

            const userEmail = req.decoded.email;
            
            const bidItem = {
                propertyId, agentEmail, offerAmount , buyerName, buyerEmail: userEmail, status: 'pending'
            };

            const bid = await bidsCollection.insertOne(bidItem)
            if (!bid) {
                return res.status(404).send({ message: 'bid not found' });
            }

            res.send({ message: 'Bid Added Successfully', bid });
        });


        app.get('/bids/:email',verifyToken, async (req, res) => {
            const email = req.params.email;
            const bids = await bidsCollection.find({buyerEmail: email}).toArray()
            const bidItems = await Promise.all(
                bids.map(async (bid) => {
                    const id = bid.propertyId;
                    const wishlistItem = await wishlistCollection.findOne({ _id: new ObjectId(id) });
                    return {
                        ...wishlistItem,
                        offerAmount: bid.offerAmount,
                        offerStatus: bid.status
                    }
                }))

            res.send(bidItems) 
        });


          





        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });

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