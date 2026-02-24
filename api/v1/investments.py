"""Investments API endpoints"""
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.investment import Portfolio, Investment, InvestmentTransaction
from src.extensions import db
from schemas import (
    portfolio_schema, portfolios_schema,
    investment_schema, investments_schema,
    investment_transaction_schema, investment_transactions_schema
)
from integrations.investments.yfinance import YFinanceCache, get_stock_data_with_fallback
from datetime import datetime

# Create namespace
ns = Namespace('investments', description='Investment operations')

# Initialize yfinance cache
yf_cache = YFinanceCache()

# Define request/response models
portfolio_model = ns.model('Portfolio', {
    'name': fields.String(required=True, description='Portfolio name'),
    'description': fields.String(description='Portfolio description'),
    'account_id': fields.Integer(description='Linked account ID'),
})

investment_model = ns.model('Investment', {
    'portfolio_id': fields.Integer(required=True, description='Portfolio ID'),
    'symbol': fields.String(required=True, description='Stock symbol (e.g., AAPL)'),
    'shares': fields.Float(required=True, description='Number of shares'),
    'purchase_price': fields.Float(required=True, description='Purchase price per share'),
    'purchase_date': fields.DateTime(description='Purchase date'),
    'notes': fields.String(description='Investment notes'),
})

transaction_model = ns.model('InvestmentTransaction', {
    'investment_id': fields.Integer(required=True, description='Investment ID'),
    'transaction_type': fields.String(required=True, description='Transaction type (buy, sell, dividend, split)'),
    'shares': fields.Float(required=True, description='Number of shares'),
    'price': fields.Float(required=True, description='Price per share'),
    'date': fields.DateTime(description='Transaction date'),
    'fees': fields.Float(description='Transaction fees'),
    'notes': fields.String(description='Transaction notes'),
})


@ns.route('/portfolios')
class PortfolioList(Resource):
    @ns.doc('list_portfolios', security='Bearer')
    @jwt_required()
    def get(self):
        """Get all portfolios for household"""
        from src.utils.household import get_all_user_ids
        current_user_id = get_jwt_identity()

        # Get all portfolios for the household
        portfolios = Portfolio.query.filter(Portfolio.user_id.in_(get_all_user_ids())).all()

        # Serialize
        result = portfolios_schema.dump(portfolios)

        return {
            'success': True,
            'portfolios': result
        }, 200

    @ns.doc('create_portfolio', security='Bearer')
    @ns.expect(portfolio_model)
    @jwt_required()
    def post(self):
        """Create a new portfolio"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        try:
            new_portfolio = Portfolio(
                name=data.get('name'),
                description=data.get('description', ''),
                account_id=data.get('account_id'),
                user_id=current_user_id
            )

            db.session.add(new_portfolio)
            db.session.commit()

            result = portfolio_schema.dump(new_portfolio)

            return {
                'success': True,
                'portfolio': result,
                'message': 'Portfolio created successfully'
            }, 201

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/portfolios/<int:id>')
@ns.param('id', 'Portfolio ID')
class PortfolioDetail(Resource):
    @ns.doc('get_portfolio', security='Bearer')
    @jwt_required()
    def get(self, id):
        """Get a specific portfolio by ID"""
        current_user_id = get_jwt_identity()

        portfolio = Portfolio.query.filter_by(id=id, user_id=current_user_id).first()

        if not portfolio:
            return {'success': False, 'error': 'Portfolio not found'}, 404

        result = portfolio_schema.dump(portfolio)

        return {
            'success': True,
            'portfolio': result
        }, 200

    @ns.doc('update_portfolio', security='Bearer')
    @ns.expect(portfolio_model)
    @jwt_required()
    def put(self, id):
        """Update a portfolio"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        portfolio = Portfolio.query.filter_by(id=id, user_id=current_user_id).first()

        if not portfolio:
            return {'success': False, 'error': 'Portfolio not found'}, 404

        try:
            portfolio.name = data.get('name', portfolio.name)
            portfolio.description = data.get('description', portfolio.description)
            portfolio.account_id = data.get('account_id', portfolio.account_id)
            portfolio.updated_at = datetime.utcnow()

            db.session.commit()

            result = portfolio_schema.dump(portfolio)

            return {
                'success': True,
                'portfolio': result,
                'message': 'Portfolio updated successfully'
            }, 200

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': str(e)
            }, 400

    @ns.doc('delete_portfolio', security='Bearer')
    @jwt_required()
    def delete(self, id):
        """Delete a portfolio"""
        current_user_id = get_jwt_identity()

        portfolio = Portfolio.query.filter_by(id=id, user_id=current_user_id).first()

        if not portfolio:
            return {'success': False, 'error': 'Portfolio not found'}, 404

        try:
            db.session.delete(portfolio)
            db.session.commit()

            return {
                'success': True,
                'message': 'Portfolio deleted successfully'
            }, 200

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/holdings')
class InvestmentList(Resource):
    @ns.doc('list_holdings', security='Bearer')
    @jwt_required()
    def get(self):
        """Get all holdings (investments) for current user"""
        current_user_id = get_jwt_identity()

        # Get portfolio_id from query params if provided
        portfolio_id = request.args.get('portfolio_id', type=int)

        # Build query
        query = db.session.query(Investment).join(Portfolio).filter(
            Portfolio.user_id == current_user_id
        )

        if portfolio_id:
            query = query.filter(Investment.portfolio_id == portfolio_id)

        investments = query.all()

        # Update current prices from yfinance
        for investment in investments:
            stock_data = yf_cache.get_ticker_info(investment.symbol)
            if stock_data:
                investment.current_price = stock_data.get('price', investment.current_price)
                investment.name = stock_data.get('name', investment.name)
                investment.sector = stock_data.get('sector', investment.sector)
                investment.industry = stock_data.get('industry', investment.industry)
                investment.last_update = datetime.utcnow()

        # Commit price updates
        db.session.commit()

        # Serialize
        result = investments_schema.dump(investments)

        return {
            'success': True,
            'holdings': result
        }, 200

    @ns.doc('create_holding', security='Bearer')
    @ns.expect(investment_model)
    @jwt_required()
    def post(self):
        """Add a new holding (investment)"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        # Verify portfolio belongs to user
        portfolio = Portfolio.query.filter_by(
            id=data.get('portfolio_id'),
            user_id=current_user_id
        ).first()

        if not portfolio:
            return {'success': False, 'error': 'Portfolio not found'}, 404

        try:
            symbol = data.get('symbol').upper()

            # Get stock info from yfinance
            stock_data = yf_cache.get_ticker_info(symbol)
            if not stock_data:
                return {
                    'success': False,
                    'error': f'Could not find stock data for symbol: {symbol}'
                }, 400

            new_investment = Investment(
                portfolio_id=data.get('portfolio_id'),
                symbol=symbol,
                name=stock_data.get('name', ''),
                shares=data.get('shares'),
                purchase_price=data.get('purchase_price'),
                current_price=stock_data.get('price', data.get('purchase_price')),
                purchase_date=data.get('purchase_date', datetime.utcnow()),
                notes=data.get('notes', ''),
                sector=stock_data.get('sector', ''),
                industry=stock_data.get('industry', ''),
                last_update=datetime.utcnow()
            )

            db.session.add(new_investment)
            db.session.commit()

            # Also create a "buy" transaction
            buy_transaction = InvestmentTransaction(
                investment_id=new_investment.id,
                transaction_type='buy',
                shares=new_investment.shares,
                price=new_investment.purchase_price,
                date=new_investment.purchase_date,
                fees=0,
                notes='Initial purchase'
            )
            db.session.add(buy_transaction)
            db.session.commit()

            result = investment_schema.dump(new_investment)

            return {
                'success': True,
                'holding': result,
                'message': 'Holding added successfully'
            }, 201

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/holdings/<int:id>')
@ns.param('id', 'Investment ID')
class InvestmentDetail(Resource):
    @ns.doc('get_holding', security='Bearer')
    @jwt_required()
    def get(self, id):
        """Get a specific holding by ID"""
        current_user_id = get_jwt_identity()

        investment = db.session.query(Investment).join(Portfolio).filter(
            Investment.id == id,
            Portfolio.user_id == current_user_id
        ).first()

        if not investment:
            return {'success': False, 'error': 'Holding not found'}, 404

        # Update current price
        stock_data = yf_cache.get_ticker_info(investment.symbol)
        if stock_data:
            investment.current_price = stock_data.get('price', investment.current_price)
            investment.last_update = datetime.utcnow()
            db.session.commit()

        result = investment_schema.dump(investment)

        return {
            'success': True,
            'holding': result
        }, 200

    @ns.doc('update_holding', security='Bearer')
    @ns.expect(investment_model)
    @jwt_required()
    def put(self, id):
        """Update a holding"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        investment = db.session.query(Investment).join(Portfolio).filter(
            Investment.id == id,
            Portfolio.user_id == current_user_id
        ).first()

        if not investment:
            return {'success': False, 'error': 'Holding not found'}, 404

        try:
            investment.shares = data.get('shares', investment.shares)
            investment.purchase_price = data.get('purchase_price', investment.purchase_price)
            investment.notes = data.get('notes', investment.notes)

            db.session.commit()

            result = investment_schema.dump(investment)

            return {
                'success': True,
                'holding': result,
                'message': 'Holding updated successfully'
            }, 200

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': str(e)
            }, 400

    @ns.doc('delete_holding', security='Bearer')
    @jwt_required()
    def delete(self, id):
        """Delete a holding"""
        current_user_id = get_jwt_identity()

        investment = db.session.query(Investment).join(Portfolio).filter(
            Investment.id == id,
            Portfolio.user_id == current_user_id
        ).first()

        if not investment:
            return {'success': False, 'error': 'Holding not found'}, 404

        try:
            db.session.delete(investment)
            db.session.commit()

            return {
                'success': True,
                'message': 'Holding deleted successfully'
            }, 200

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/transactions')
class TransactionList(Resource):
    @ns.doc('list_investment_transactions', security='Bearer')
    @jwt_required()
    def get(self):
        """Get all investment transactions for current user"""
        current_user_id = get_jwt_identity()

        # Get investment_id from query params if provided
        investment_id = request.args.get('investment_id', type=int)

        # Build query
        query = db.session.query(InvestmentTransaction).join(Investment).join(Portfolio).filter(
            Portfolio.user_id == current_user_id
        )

        if investment_id:
            query = query.filter(InvestmentTransaction.investment_id == investment_id)

        transactions = query.order_by(InvestmentTransaction.date.desc()).all()

        # Serialize
        result = investment_transactions_schema.dump(transactions)

        return {
            'success': True,
            'transactions': result
        }, 200

    @ns.doc('create_investment_transaction', security='Bearer')
    @ns.expect(transaction_model)
    @jwt_required()
    def post(self):
        """Create a new investment transaction"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        # Verify investment belongs to user
        investment = db.session.query(Investment).join(Portfolio).filter(
            Investment.id == data.get('investment_id'),
            Portfolio.user_id == current_user_id
        ).first()

        if not investment:
            return {'success': False, 'error': 'Investment not found'}, 404

        try:
            new_transaction = InvestmentTransaction(
                investment_id=data.get('investment_id'),
                transaction_type=data.get('transaction_type'),
                shares=data.get('shares'),
                price=data.get('price'),
                date=data.get('date', datetime.utcnow()),
                fees=data.get('fees', 0),
                notes=data.get('notes', '')
            )

            # Update investment shares based on transaction type
            if data.get('transaction_type') == 'buy':
                investment.shares += data.get('shares')
            elif data.get('transaction_type') == 'sell':
                investment.shares -= data.get('shares')
            elif data.get('transaction_type') == 'split':
                # For stock splits, the shares value represents the split ratio
                split_ratio = data.get('shares')
                investment.shares *= split_ratio
                investment.purchase_price /= split_ratio

            db.session.add(new_transaction)
            db.session.commit()

            result = investment_transaction_schema.dump(new_transaction)

            return {
                'success': True,
                'transaction': result,
                'message': 'Transaction created successfully'
            }, 201

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': str(e)
            }, 400


@ns.route('/quote/<string:symbol>')
@ns.param('symbol', 'Stock symbol')
class StockQuote(Resource):
    @ns.doc('get_stock_quote', security='Bearer')
    @jwt_required()
    def get(self, symbol):
        """Get real-time stock quote with automatic fallback to FMP"""
        exchange = request.args.get('exchange', 'US')

        # Use fallback function that tries yfinance first, then FMP
        stock_data = get_stock_data_with_fallback(symbol.upper(), exchange)

        if not stock_data:
            return {
                'success': False,
                'error': f'Stock not found: {symbol}. Please try again later or check the symbol.'
            }, 404

        return {
            'success': True,
            'quote': stock_data
        }, 200


@ns.route('/history/<string:symbol>')
@ns.param('symbol', 'Stock symbol')
class StockHistory(Resource):
    @ns.doc('get_stock_history', security='Bearer')
    @jwt_required()
    def get(self, symbol):
        """Get stock price history"""
        exchange = request.args.get('exchange', 'US')
        period = request.args.get('period', '1mo')  # 1d, 1mo, 3mo, 1y, etc.

        history_data = yf_cache.get_ticker_history(symbol.upper(), exchange, period)

        if not history_data:
            return {
                'success': False,
                'error': f'History not found for: {symbol}'
            }, 404

        return {
            'success': True,
            'history': history_data
        }, 200


@ns.route('/exchanges')
class ExchangeList(Resource):
    @ns.doc('list_exchanges', security='Bearer')
    @jwt_required()
    def get(self):
        """Get list of supported stock exchanges"""
        exchanges = yf_cache.get_available_exchanges()

        return {
            'success': True,
            'exchanges': exchanges
        }, 200
