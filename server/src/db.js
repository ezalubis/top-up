import dotenv from "dotenv";
dotenv.config();
import mariadb from "mariadb";


const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    database: process.env.DB_DATABASE,    
    typeCast: function (field, next) {
        if (field.type === 'NEWDECIMAL' || field.type === 'LONGLONG') {
            return field.string();
        }
        return next();
    }
});

const conn = await pool.getConnection();
console.log("Database is Connect");

export default conn;