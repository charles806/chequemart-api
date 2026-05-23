import mongoose from 'mongoose';
import { sequelize } from './src/config/postgres.js';
import Wallet from './src/models/Wallet.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Postgres connected');
    
    // Update Wallets
    await sequelize.query(`
      UPDATE "Wallets" 
      SET available_balance = 0 
      WHERE available_balance = 'NaN' OR available_balance IS NULL;
    `);
    await sequelize.query(`
      UPDATE "Wallets" 
      SET pending_balance = 0 
      WHERE pending_balance = 'NaN' OR pending_balance IS NULL;
    `);
    await sequelize.query(`
      UPDATE "Wallets" 
      SET total_earned = 0 
      WHERE total_earned = 'NaN' OR total_earned IS NULL;
    `);
    console.log('Wallets sanitized');
    
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
