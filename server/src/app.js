import dotenv from "dotenv";
dotenv.config();

import express from "express";
import conn from "./db.js";

import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import multer from "multer";

const app = express();
app.use(cookieParser());
app.use(express.json());
app.post("/api/register", async (req, res) => {
  const salt = await bcrypt.genSalt();
  const hash = await bcrypt.hash(req.body.password, salt);
  await conn.query(
    `INSERT INTO authentication (username,email,password,type_account) VALUES ('${req.body.username}','${req.body.email}','${hash}','user')`
  );
  res.send("Berhasil Daftar");
});

app.use((req, res, next) => {
  const publicPaths = ["/api/login", "/assets", "/login"];
  const isPublicPath = publicPaths.some(path => req.path.startsWith(path));

  if (isPublicPath) {
    return next();
  }

  const token = req.cookies.token;
  if (!token) {
    if (req.path.startsWith("/api")) {
      return res.status(401).send("Anda harus login terlebih dahulu.");
    } else {
      return res.redirect("/login");
    }
  }

  try {
    const payload = jwt.verify(token, process.env.SECRET_KEY);
    req.me = payload;

    if (req.path.startsWith("/admin")) {
      if (payload.role === 'admin') {
        return next();
      } else {
        return res.status(403).send("Anda tidak memiliki akses ke halaman admin.");
      }
    }

    if (req.path.startsWith("/login")) {
      return res.redirect(payload.role === "admin" ? "/admin" : "/user");
    }

    next();
  } catch (err) {
    res.clearCookie("token");
    if (req.path.startsWith("/api")) {
      return res.status(401).send("Token tidak valid, silakan login kembali.");
    } else {
      return res.redirect("/login");
    }
  }
});


import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "../../public")));
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../../public/assets/img');
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname))
  }
});
const upload = multer({ storage: storage });

app.post("/api/login", async (req, res) => {
  try {
    const [results] = await conn.execute(
      'SELECT * FROM authentication WHERE email = ?',
      [req.body.email]
    );
    // Check if results array is empty
    if (results.length === 0) {
      return res.status(401).send("Akun tidak ditemukan.");
    }

    // const results[0] = results[0];
    let passwordMatch = false;
    let role = 'user';
    if (req.body.email === "admin@gmail.com") {
      if (req.body.password === results.password) {
        passwordMatch = true;
        role = 'admin';
      }
    } else {
      passwordMatch = await bcrypt.compare(req.body.password, results.password);
    }

    // If password matches, generate and send the token
    if (passwordMatch) {
      const token = jwt.sign(
        { id: results.id, email: results.email, role: role },
        process.env.SECRET_KEY,
        { expiresIn: '1h' }
      );
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 3600000 // 1 hour
      });
      return res.send(token);
    } else {
      return res.status(401).send("Kata sandi salah.");
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send("Terjadi kesalahan pada server.");
  }
});

app.get('/api/user', async (req, res) => {
  try {
    const results = await conn.query(`SELECT * FROM authentication WHERE type_account='user'`);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const results = await conn.query(`SELECT * FROM authentication WHERE type_account='user' AND id=?`, [id]);
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/user', async (req, res) => {
  try {
      const { username, email, password } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      await conn.execute('INSERT INTO authentication (username, email, password,type_account) VALUES (?, ?, ?,"user")', [username, email, hashedPassword]);
      res.status(201).send('Pengguna berhasil ditambahkan.');
  } catch (err) {
      console.error(err);
      res.status(500).send('Terjadi kesalahan pada server.');
  }
});
app.put('/api/user/:id', async (req, res) => {
  try {
    const salt = await bcrypt.genSalt();
    const hash = await bcrypt.hash(req.body.password, salt);
    const { id } = req.params;
    const { username,email} = req.body; // Destructure the data from request body

    const results = await conn.query(`UPDATE authentication SET username=?, email=?, password=?, type_account=? WHERE id=? AND type_account='user'`,
      [username,email, hash, "user", id]);

    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found or no changes made' });
    }
    res.json("Data berhasil diperbarui");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Delete user by id
app.delete('/api/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const results = await conn.query(`DELETE FROM authentication WHERE id=? AND type_account='user'`, [id]);
    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json("Data berhasil dihapus");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/games', async (req, res) => {
  const results = await conn.query(`SELECT * FROM data_game WHERE stock>0`);
  res.send(results);
});
app.get('/api/game/:id', async (req, res) => {
  const results = await conn.query(`SELECT * FROM data_game WHERE id=${req.params.id}`);
  res.send(results);
});
app.post('/api/games', upload.single('image_url'), async (req, res) => {
  await conn.query(`INSERT INTO data_game (game,stock,image_url) VALUES ('${req.body.game}','${req.body.stock}','${req.file.filename}')`);
  res.json("data berhasil ditambahkan");
});
app.put('/api/games/:id', upload.single('image_url'), async (req, res) => {
  try {
    const { id } = req.params;
    const { game, stock } = req.body;
    let imageUrl = req.body.image_url; // Default to existing URL

    // Check if a new file was uploaded
    if (req.file) {
      imageUrl = req.file.filename;

      // Optionally, delete old file if needed
      const [oldGame] = await conn.query('SELECT image_url FROM data_game WHERE id = ?', [id]);
      if (oldGame[0] && oldGame[0].image_url) {
        const oldImagePath = path.join(__dirname, '../../public/assets/img', oldGame[0].image_url);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
    }

    await conn.query(`UPDATE data_game SET game = ?, stock = ?, image_url = ? WHERE id = ?`,
      [game, stock, imageUrl, id]);
    res.json("Data berhasil diperbarui");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Remove a game
app.delete('/api/games/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Optionally, delete the image file associated with the game
    const [game] = await conn.query('SELECT image_url FROM data_game WHERE id = ?', [id]);
    if (game[0] && game[0].image_url) {
      const imagePath = path.join(__dirname, '../../public/assets/img', game[0].image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await conn.query(`DELETE FROM data_game WHERE id = ?`, [id]);
    res.json("Data berhasil dihapus");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/payment', async(req, res) => {
  // Cek apakah pengguna sudah login atau belum
  if (!req.session.user) {
      return res.status(401).send('Unauthorized');
  }

  // Ambil gameId dari query parameter
  const gameId = req.query.gameId;

  // Query untuk mengambil detail game dari database berdasarkan gameId
  const query = 'SELECT * FROM games WHERE id = ?';
  connection.query(query, [gameId], (err, results) => {
      if (err) {
          console.error('Error querying database:', err);
          return res.status(500).send('Internal Server Error');
      }

      if (results.length === 0) {
          return res.status(404).send('Game not found');
      }

      const game = results[0];

      // Sekarang Anda memiliki detail game dan data pengguna yang sedang login (req.session.user)

      // Lakukan apa pun yang perlu dilakukan untuk menyiapkan halaman pembayaran
      // Misalnya, render halaman HTML atau kirim data JSON ke frontend
      res.json({ user: req.session.user, game: game });
  });
});

app.post('/api/transaction', async (req, res) => {
  try {
    const { payment_method, diamond, card_number, game, id_game } = req.body;
    const { email } = req.me;

    // Pastikan semua data yang diperlukan tersedia
    if (!email || !payment_method || !diamond || !card_number || !game || !id_game) {
      return res.status(400).json({ success: false, message: 'Data yang diperlukan tidak lengkap' });
    }

    // Cek stok diamond
    const checkStockQuery = await conn.query(`SELECT stock FROM data_game WHERE game = '${game}'`);
    if (checkStockQuery[0].stock === 0 || checkStockQuery[0].stock < diamond) {
      return res.status(400).json({ success: false, message: 'Stok tidak mencukupi' });
    }

    // Validasi nomor kartu sesuai metode pembayaran
    const rekeningPattern = {
      BCA: /^[0-9]{10}$/,         // BCA: 10 digit
      BNI: /^[0-9]{9,10}$/,       // BNI: 9-10 digit
      BRI: /^[0-9]{10,15}$/       // BRI: 10-15 digit
    };

    function validateRekening(paymentMethod, cardNumber) {
      if (!rekeningPattern[paymentMethod].test(cardNumber)) {
        return { success: false, message: 'Nomor rekening tidak valid' };
      }
      return { success: true, message: 'Nomor rekening valid' };
    }

    // Hitung total harga diamond (misalnya 1 diamond = 1.000)
    let totalHarga = diamond * 1000;

    // Terapkan diskon jika pembelian di atas 50.000
    if (totalHarga > 50000) {
      totalHarga *= 0.9; // diskon 10%
    }

    // Simpan transaksi
    const insertQuery = await conn.query(`INSERT INTO data_transaction_user (email, game, payment_method, diamond, account_number, price, date, id_game)
                         VALUES ('${email}', '${game}', '${payment_method}', ${diamond}, '${card_number}', ${totalHarga}, now(), ${id_game})`);

    // Update stok diamond
    const updateStockQuery = await conn.query(`UPDATE data_game SET stock = stock - ${diamond} WHERE game = '${game}'`);

    res.status(200).json({ success: true, message: 'Transaksi berhasil' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada database' });
  }
});


app.get('/api/history', async (req,res)=>{
  try {
    const {email} = req.me;
    const results = await conn.query(`SELECT diamond,a.game,account_number,payment_method,date,id_game,image_url FROM data_transaction_user a INNER JOIN data_game b ON a.game = b.game WHERE email = '${email}'`);
    res.send(results);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
})

app.get('/api/role', (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: "Token tidak ditemukan." });

  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) return res.status(401).json({ message: "Token tidak valid." });

    res.json({ role: decoded.role });
  });
});

app.get('/api/stats', async (req, res) => {
  try {
      const [orders] = await conn.execute('SELECT COUNT(*) AS totalOrders FROM data_transaction_user');
      const [games] = await conn.execute('SELECT COUNT(*) AS totalGames FROM data_game');
      const [users] = await conn.execute('SELECT COUNT(*) AS totalUsers FROM authentication WHERE type_account = "user"');

      res.json({
        totalOrders: orders.totalOrders.toString(),
        totalGames: games.totalGames.toString(),
        totalUsers: users.totalUsers.toString()
    });
  } catch (err) {
      console.error(err);
      res.status(500).send('Terjadi kesalahan pada server.');
  }
});

app.get('/api/sales', async (req, res) => {
  try {
      const rows = await conn.execute('SELECT * FROM data_transaction_user');
      res.json(rows);
  } catch (err) {
      console.error(err);
      res.status(500).send('Terjadi kesalahan pada server.');
  }
});

app.get('/api/games/search',async (req, res) => {
  const results = await conn.query(`SELECT * FROM data_game WHERE game LIKE '%${req.query.q}%'`);
  res.send(results);
});


app.get("/api/logout",(req,res)=> {
  res.setHeader("Cache-Control", "no-store");
  res.clearCookie("token");
  res.send("Logout berhasil.");
})

app.listen(3000, () => {
  console.log("Server is Running!");
})

