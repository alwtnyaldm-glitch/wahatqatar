const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Get all visitors
router.get('/', async (req, res) => {
  try {
    const { online, page = 1, limit = 50 } = req.query;
    let query = 'SELECT * FROM visitors';
    const params = [];
    
    if (online === 'true') {
      query += ' WHERE is_online = true';
    }
    
    query += ' ORDER BY last_activity DESC LIMIT $1 OFFSET $2';
    params.push(limit, (page - 1) * limit);
    
    const result = await pool.query(query, params);
    res.json({ success: true, visitors: result.rows });
  } catch (error) {
    console.error('Error fetching visitors:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get single visitor
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await pool.query(
      'SELECT * FROM visitors WHERE session_id = $1',
      [sessionId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Visitor not found' });
    }
    
    res.json({ success: true, visitor: result.rows[0] });
  } catch (error) {
    console.error('Error fetching visitor:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Check if visitor is banned
router.get('/check-ban/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const ip = req.ip || req.headers['x-forwarded-for'];
    
    const result = await pool.query(
      'SELECT * FROM banned_users WHERE (session_id = $1 OR ip_address = $2) AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1',
      [sessionId, ip]
    );
    
    if (result.rows.length > 0) {
      res.json({ 
        success: true, 
        banned: true, 
        message: result.rows[0].custom_message || 'تم حظرك من الموقع' 
      });
    } else {
      res.json({ success: true, banned: false });
    }
  } catch (error) {
    console.error('Error checking ban:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get visitor submission history by type (LAZY LOADING)
router.get('/:sessionId/history/:type', async (req, res) => {
  try {
    const { sessionId, type } = req.params;
    const validTypes = ['delivery', 'payment', 'verification'];
    
    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid type. Must be: delivery, payment, or verification' 
      });
    }
    
    // Get all submissions of this type for the visitor
    const result = await pool.query(
      `SELECT * FROM form_submissions 
       WHERE session_id = $1 AND form_type = $2 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [sessionId, type]
    );
    
    // Get visitor's current data
    const visitorResult = await pool.query(
      'SELECT * FROM visitors WHERE session_id = $1',
      [sessionId]
    );
    
    res.json({ 
      success: true, 
      type,
      sessionId,
      currentData: visitorResult.rows[0] || null,
      submissions: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching submission history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get all submission history for a visitor (LAZY LOADING)
router.get('/:sessionId/history', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get all submissions grouped by type
    const result = await pool.query(
      `SELECT form_type, COUNT(*) as count, MAX(created_at) as last_attempt
       FROM form_submissions 
       WHERE session_id = $1 
       GROUP BY form_type
       ORDER BY MAX(created_at) DESC`,
      [sessionId]
    );
    
    // Get visitor's current data
    const visitorResult = await pool.query(
      'SELECT * FROM visitors WHERE session_id = $1',
      [sessionId]
    );
    
    res.json({ 
      success: true, 
      sessionId,
      currentData: visitorResult.rows[0] || null,
      summary: result.rows
    });
  } catch (error) {
    console.error('Error fetching submission history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get visitor status indicators
router.get('/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get latest submission of each type
    const deliveryStatus = await pool.query(
      `SELECT is_processed, created_at FROM form_submissions 
       WHERE session_id = $1 AND form_type = 'delivery' 
       ORDER BY created_at DESC LIMIT 1`,
      [sessionId]
    );
    
    const paymentStatus = await pool.query(
      `SELECT is_processed, created_at FROM form_submissions 
       WHERE session_id = $1 AND form_type = 'payment' 
       ORDER BY created_at DESC LIMIT 1`,
      [sessionId]
    );
    
    const verificationStatus = await pool.query(
      `SELECT is_processed, created_at FROM form_submissions 
       WHERE session_id = $1 AND form_type = 'verification' 
       ORDER BY created_at DESC LIMIT 1`,
      [sessionId]
    );
    
    // Get visitor's form submission status
    const visitorResult = await pool.query(
      'SELECT form_submitted, payment_submitted, verification_submitted, last_activity FROM visitors WHERE session_id = $1',
      [sessionId]
    );
    
    res.json({
      success: true,
      sessionId,
      status: {
        delivery: {
          submitted: visitorResult.rows[0]?.form_submitted || false,
          processed: deliveryStatus.rows[0]?.is_processed || false,
          lastAttempt: deliveryStatus.rows[0]?.created_at || null,
          attemptCount: deliveryStatus.rows.length > 0 ? 1 : 0
        },
        payment: {
          submitted: visitorResult.rows[0]?.payment_submitted || false,
          processed: paymentStatus.rows[0]?.is_processed || false,
          lastAttempt: paymentStatus.rows[0]?.created_at || null,
          attemptCount: paymentStatus.rows.length > 0 ? 1 : 0
        },
        verification: {
          submitted: visitorResult.rows[0]?.verification_submitted || false,
          processed: verificationStatus.rows[0]?.is_processed || false,
          lastAttempt: verificationStatus.rows[0]?.created_at || null,
          attemptCount: verificationStatus.rows.length > 0 ? 1 : 0
        },
        lastActivity: visitorResult.rows[0]?.last_activity || null
      }
    });
  } catch (error) {
    console.error('Error fetching visitor status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
