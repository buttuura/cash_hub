"""Domain routes loaded into the shared API router."""

try:
    from .. import app_shared as _shared
    from ..app_shared import *
except ImportError:
    import app_shared as _shared
    from app_shared import *

for _name in dir(_shared):
    if not _name.startswith("__"):
        globals()[_name] = getattr(_shared, _name)


@api_router.post("/stats/distribute-interest")
async def distribute_interest_shares(user: dict = Depends(require_admin)):
    return await distribute_interest_shares_internal()


@api_router.get("/stats/group")
async def get_group_stats(user: dict = Depends(get_current_user)):
    await distribute_interest_shares_internal()

    total_members = await db.users.count_documents({"role": {"$nin": ["super_admin", "treasurer"]}})
    premium_members = await db.users.count_documents({"membership_type": "premium", "role": {"$nin": ["super_admin", "treasurer"]}})
    
    # Total savings from all members
    pipeline = [
        {"$match": {"role": {"$nin": ["super_admin", "treasurer"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_savings"}}}
    ]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_savings = result[0]["total"] if result else 0
    
    # Total development fund from all members
    pipeline = [
        {"$match": {"role": {"$nin": ["super_admin", "treasurer"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$development_fund"}}}
    ]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_development = result[0]["total"] if result else 0
    
    # Total interest earned
    total_interest = await calculate_total_interest_earned()
    
    # Total late fees
    total_late_fees = await calculate_total_late_fees()
    
    # Total petty cash used
    total_petty_cash = await get_total_petty_cash_used()

    # Pending interest share pool available for distribution
    pending_interest_share = await calculate_pending_interest_share_pool()
    total_slots = await get_total_group_slots()
    per_slot_interest_share = float(round(pending_interest_share / total_slots, 2)) if total_slots > 0 else 0.0
    
    # Active loans
    pipeline = [
        {"$match": {"status": "approved", "repaid": False}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    result = await db.loans.aggregate(pipeline).to_list(1)
    active_loans_amount = result[0]["total"] if result else 0
    active_loans_count = result[0]["count"] if result else 0
    
    # Total loans ever given
    pipeline = [
        {"$match": {"status": {"$in": ["approved", "repaid"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    result = await db.loans.aggregate(pipeline).to_list(1)
    total_loans_given = result[0]["total"] if result else 0
    total_loans_count = result[0]["count"] if result else 0
    
    # AUTO-CALCULATE Total Group Balance
    # = Total Savings + Development Fund + Interest Earned + Late Fees - Petty Cash
    total_group_balance = total_savings + total_development + total_interest + total_late_fees - total_petty_cash
    
    # Pending counts
    pending_deposits = await db.deposits.count_documents({"status": "pending"})
    pending_loans = await db.loans.count_documents({"status": {"$in": ["pending_guarantor", "pending_admin"]}})
    pending_withdrawals = await db.withdrawals.count_documents({"status": "pending"})
    
    return {
        "total_members": total_members,
        "premium_members": premium_members,
        "ordinary_members": total_members - premium_members,
        "total_savings": total_savings,
        "total_development_fund": total_development,
        "total_interest_earned": total_interest,
        "total_late_fees": total_late_fees,
        "total_petty_cash_used": total_petty_cash,
        "pending_interest_share": pending_interest_share,
        "total_slots": total_slots,
        "per_slot_interest_share": per_slot_interest_share,
        "total_group_balance": total_group_balance,
        "active_loans_amount": active_loans_amount,
        "active_loans_count": active_loans_count,
        "total_loans_given": total_loans_given,
        "total_loans_count": total_loans_count,
        "pending_deposits": pending_deposits,
        "pending_loans": pending_loans,
        "pending_withdrawals": pending_withdrawals,
        "monthly_savings_required": MONTHLY_SAVINGS,
        "development_fee": DEVELOPMENT_FEE,
        "max_loan_amount": MAX_LOAN_AMOUNT,
        "year_end_date": YEAR_END_DATE
    }


@api_router.get("/stats/financial")
async def get_financial_stats(user: dict = Depends(get_current_user)):
    """Get detailed financial breakdown"""
    
    # Total savings
    pipeline = [
        {"$match": {"role": {"$nin": ["super_admin", "treasurer"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_savings"}}}
    ]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_savings = result[0]["total"] if result else 0
    
    # Total development fund
    pipeline = [
        {"$match": {"role": {"$nin": ["super_admin", "treasurer"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$development_fund"}}}
    ]
    result = await db.users.aggregate(pipeline).to_list(1)
    total_development = result[0]["total"] if result else 0
    
    # Total interest earned
    total_interest = await calculate_total_interest_earned()
    
    # Total late fees
    total_late_fees = await calculate_total_late_fees()
    
    # Total petty cash
    total_petty_cash = await get_total_petty_cash_used()
    
    # Get petty cash breakdown
    petty_cash_items = await db.petty_cash.find({}).sort("created_at", -1).to_list(100)
    for item in petty_cash_items:
        item["id"] = str(item["_id"])
        item.pop("_id", None)
    
    # Active loans details
    pipeline = [
        {"$match": {"status": "approved", "repaid": False}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    result = await db.loans.aggregate(pipeline).to_list(1)
    active_loans_amount = result[0]["total"] if result else 0
    active_loans_count = result[0]["count"] if result else 0
    
    # Repaid loans
    pipeline = [
        {"$match": {"status": "repaid"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    result = await db.loans.aggregate(pipeline).to_list(1)
    repaid_loans_amount = result[0]["total"] if result else 0
    repaid_loans_count = result[0]["count"] if result else 0
    
    # Total approved withdrawals
    pipeline = [
        {"$match": {"status": "approved"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    result = await db.withdrawals.aggregate(pipeline).to_list(1)
    total_withdrawals = result[0]["total"] if result else 0
    
    # Total group balance
    total_group_balance = total_savings + total_development + total_interest + total_late_fees - total_petty_cash
    
    return {
        "total_savings": total_savings,
        "total_development_fund": total_development,
        "total_interest_earned": total_interest,
        "total_late_fees": total_late_fees,
        "total_petty_cash_used": total_petty_cash,
        "total_group_balance": total_group_balance,
        "active_loans_amount": active_loans_amount,
        "active_loans_count": active_loans_count,
        "repaid_loans_amount": repaid_loans_amount,
        "repaid_loans_count": repaid_loans_count,
        "total_withdrawals": total_withdrawals,
        "petty_cash_items": petty_cash_items,
        "breakdown": {
            "savings": {"amount": total_savings, "label": "Member Savings"},
            "development": {"amount": total_development, "label": "Development Fund"},
            "interest": {"amount": total_interest, "label": "Loan Interest"},
            "late_fees": {"amount": total_late_fees, "label": "Late Fees"},
            "petty_cash": {"amount": -total_petty_cash, "label": "Petty Cash (Expenses)"}
        }
    }


@api_router.get("/stats/rules")
async def get_group_rules():
    """Return group rules for display"""
    return {
        "monthly_savings": MONTHLY_SAVINGS,
        "development_fee": DEVELOPMENT_FEE,
        "late_fee_per_position": LATE_FEE_PER_POSITION,
        "max_loan_amount": MAX_LOAN_AMOUNT,
        "loan_interest_normal": f"{LOAN_INTEREST_NORMAL * 100}%",
        "loan_interest_extended": f"{LOAN_INTEREST_EXTENDED * 100}%",
        "loan_normal_period_months": LOAN_NORMAL_PERIOD_MONTHS,
        "max_guarantees_per_member": MAX_GUARANTEES_PER_MEMBER,
        "committee_appreciation": COMMITTEE_APPRECIATION,
        "year_end_date": YEAR_END_DATE,
        "rules": [
            f"Monthly savings: UGX {MONTHLY_SAVINGS:,} (due 1st-10th)",
            f"Late fee: UGX {LATE_FEE_PER_POSITION:,} per position after 10th",
            f"Development fee: UGX {DEVELOPMENT_FEE:,} per month (non-withdrawable)",
            f"Max loan: UGX {MAX_LOAN_AMOUNT:,} per slot (up to {MAX_GUARANTEES_PER_MEMBER} slots = UGX {MAX_LOAN_AMOUNT * MAX_GUARANTEES_PER_MEMBER:,})",
            "Loan interest: 3% per month (within 4 months), 5% beyond",
            "Each loan requires a guarantor (max 2 guarantees per member)",
            "2 months notice required to leave group",
            f"Year-end sharing: {YEAR_END_DATE}"
        ]
    }

