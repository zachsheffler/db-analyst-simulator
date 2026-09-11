#!/usr/bin/env python3
"""Writes the `vizSprints` section into each shipped challenges pack.

Reference SQL must produce exactly the columns the visual builder produces:
dimensions first, then one column per measure. Column names never matter.
Re-run after editing; `npm run validate` checks every template against the data.
"""
import json, sqlite3, random, re

def db_for(pack):
    d = json.load(open(f'public/packs/{pack}-db.json'))['databases'][0]
    con = sqlite3.connect(':memory:')
    con.execute('PRAGMA foreign_keys=ON')
    for s in d['ddl'] + d['seed']:
        con.execute(s)
    return con

def q(id, topic, diff, text, sql, types, params=None, order=False, title=False, hints=None, points=None):
    t = {'id': id, 'topic': topic, 'difficulty': diff, 'text': text, 'sql': sql, 'types': types}
    if params: t['params'] = params
    if order: t['orderMatters'] = True
    if title: t['requireTitle'] = True
    if hints: t['hints'] = hints
    if points: t['points'] = points
    return t

BAR = ['clusteredColumn', 'clusteredBar']
PIE = ['pie', 'donut', 'clusteredBar', 'clusteredColumn']
STACK = ['stackedColumn', 'clusteredColumn', 'clusteredBar']
CARD = ['card']
LINE = ['line']
TABLE = ['table']

# ---------------------------------------------------------------------------
dave = [
    q('dv01', 'single-value', 1, 'Show one number: total earnings (before tips) across all of Dave\'s gigs.', 'SELECT SUM(Earnings) FROM Gig', CARD, hints=['A card shows a single value.', 'Earnings lives in Gig.']),
    q('dv02', 'single-value', 1, 'Show one number: how many gigs Dave has worked.', 'SELECT COUNT(GigID) FROM Gig', CARD, hints=['Count the gig IDs.']),
    q('dv03', 'single-value', 1, 'Show one number: the total tips Dave has received.', 'SELECT SUM(Tips) FROM Gig', CARD),
    q('dv04', 'single-value', 2, 'Show one number: the biggest single-gig earnings (before tips).', 'SELECT MAX(Earnings) FROM Gig', CARD, hints=['Change the aggregation on the value.']),
    q('dv05', 'compare', 2, 'Compare total earnings (before tips) across the platforms, by platform name.', 'SELECT P.PlatformName, SUM(G.Earnings) FROM Gig G JOIN Platform P ON G.PlatformID = P.PlatformID GROUP BY P.PlatformName', BAR, hints=['Axis: PlatformName; values: sum of Earnings. The join is automatic.']),
    q('dv06', 'compare', 2, 'Compare total miles driven per vehicle, by nickname.', 'SELECT V.Nickname, SUM(G.Miles) FROM Gig G JOIN Vehicle V ON G.VehicleID = V.VehicleID GROUP BY V.Nickname', BAR),
    q('dv07', 'compare', 2, 'Compare the average hours per gig on each platform (by name).', 'SELECT P.PlatformName, AVG(G.Hours) FROM Gig G JOIN Platform P ON G.PlatformID = P.PlatformID GROUP BY P.PlatformName', BAR, hints=['Average, not sum.']),
    q('dv08', 'compare', 2, 'Compare the number of gigs done with each vehicle type.', 'SELECT V.VehicleType, COUNT(G.GigID) FROM Gig G JOIN Vehicle V ON G.VehicleID = V.VehicleID GROUP BY V.VehicleType', BAR),
    q('dv09', 'compare', 2, 'Compare the number of expenses recorded in each expense category (by name).', 'SELECT C.CategoryName, COUNT(E.ExpenseID) FROM Expense E JOIN ExpenseCategory C ON E.CategoryID = C.CategoryID GROUP BY C.CategoryName', BAR),
    q('dv10', 'trend', 2, 'Show how total earnings (before tips) changed month by month. Use GigMonth.', 'SELECT GigMonth, SUM(Earnings) FROM Gig GROUP BY GigMonth', LINE, hints=['A trend over time wants a line.']),
    q('dv11', 'trend', 2, 'Show the monthly total of expenses over time (ExpenseMonth).', 'SELECT ExpenseMonth, SUM(Amount) FROM Expense GROUP BY ExpenseMonth', LINE),
    q('dv12', 'trend', 3, 'A titled line chart of total miles per month (GigMonth). Give it a title.', 'SELECT GigMonth, SUM(Miles) FROM Gig GROUP BY GigMonth', LINE, title=True),
    q('dv13', 'part-whole', 2, 'Show each expense category\'s share of the total amount spent (by category name).', 'SELECT C.CategoryName, SUM(E.Amount) FROM Expense E JOIN ExpenseCategory C ON E.CategoryID = C.CategoryID GROUP BY C.CategoryName', PIE, hints=['Six categories or fewer: a pie is fine; bars work too.']),
    q('dv14', 'part-whole', 2, 'Show how the number of gigs splits across service types (rideshare, food, package).', 'SELECT P.ServiceType, COUNT(G.GigID) FROM Gig G JOIN Platform P ON G.PlatformID = P.PlatformID GROUP BY P.ServiceType', PIE),
    q('dv15', 'table', 2, 'A table listing every vehicle: nickname, vehicle type and model year.', 'SELECT Nickname, VehicleType, ModelYear FROM Vehicle', TABLE, hints=['Three columns, no aggregation needed (one row per vehicle).']),
    q('dv16', 'table', 3, 'A table with one row per platform: platform name, total earnings and total tips.', 'SELECT P.PlatformName, SUM(G.Earnings), SUM(G.Tips) FROM Gig G JOIN Platform P ON G.PlatformID = P.PlatformID GROUP BY P.PlatformName', TABLE),
    q('dv17', 'filter', 3, 'Monthly total earnings (GigMonth), but only for gigs on {{platform}}.', "SELECT G.GigMonth, SUM(G.Earnings) FROM Gig G JOIN Platform P ON G.PlatformID = P.PlatformID WHERE P.PlatformName = '{{platform}}' GROUP BY G.GigMonth", LINE + ['clusteredColumn'], params={'platform': {'from': 'SELECT PlatformName FROM Platform'}}, hints=['Drop PlatformName into the filters and tick one value.']),
    q('dv18', 'filter', 3, 'Total expense amount by category name, counting only expenses tied to {{vehicle}}.', "SELECT C.CategoryName, SUM(E.Amount) FROM Expense E JOIN ExpenseCategory C ON E.CategoryID = C.CategoryID JOIN Vehicle V ON E.VehicleID = V.VehicleID WHERE V.Nickname = '{{vehicle}}' GROUP BY C.CategoryName", PIE, params={'vehicle': {'from': 'SELECT Nickname FROM Vehicle'}}),
    q('dv19', 'filter', 3, 'Number of gigs per platform name, counting only gigs of at least {{h}} hours.', 'SELECT P.PlatformName, COUNT(G.GigID) FROM Gig G JOIN Platform P ON G.PlatformID = P.PlatformID WHERE G.Hours >= {{h}} GROUP BY P.PlatformName', BAR, params={'h': {'values': [3, 4, 5]}}, hints=['A numeric filter is a range: from the threshold up to something huge.']),
    q('dv20', 'calc', 3, 'Total pay including tips, per platform name. Define a calculated field: Earnings + Tips.', 'SELECT P.PlatformName, SUM(G.Earnings + G.Tips) FROM Gig G JOIN Platform P ON G.PlatformID = P.PlatformID GROUP BY P.PlatformName', BAR, hints=['Create the field, then sum it on the y-axis.']),
    q('dv21', 'calc', 4, 'Earnings per hour by vehicle nickname, computed as total earnings divided by total hours: SUM(Earnings) / SUM(Hours).', 'SELECT V.Nickname, SUM(G.Earnings) / SUM(G.Hours) FROM Gig G JOIN Vehicle V ON G.VehicleID = V.VehicleID GROUP BY V.Nickname', BAR, hints=['This is an aggregate measure: write the SUMs inside the calculated field.']),
    q('dv22', 'calc', 4, 'Net pay after commission per platform name: sum of Earnings * (1 - CommissionPct / 100.0).', 'SELECT P.PlatformName, SUM(G.Earnings * (1 - P.CommissionPct / 100.0)) FROM Gig G JOIN Platform P ON G.PlatformID = P.PlatformID GROUP BY P.PlatformName', BAR, hints=['The expression mixes two tables; the builder joins them for you.']),
    q('dv23', 'two-dim', 4, 'Total miles per vehicle type, broken down by platform name (one series per platform).', 'SELECT V.VehicleType, P.PlatformName, SUM(G.Miles) FROM Gig G JOIN Vehicle V ON G.VehicleID = V.VehicleID JOIN Platform P ON G.PlatformID = P.PlatformID GROUP BY V.VehicleType, P.PlatformName', STACK, hints=['Axis: VehicleType; legend: PlatformName.']),
    q('dv24', 'two-dim', 4, 'Total expense amount per category name, split by vehicle type.', 'SELECT C.CategoryName, V.VehicleType, SUM(E.Amount) FROM Expense E JOIN ExpenseCategory C ON E.CategoryID = C.CategoryID JOIN Vehicle V ON E.VehicleID = V.VehicleID GROUP BY C.CategoryName, V.VehicleType', STACK),
    q('dv25', 'sort', 3, 'Rank the platforms by total tips, highest first (bar chart, sorted).', 'SELECT P.PlatformName, SUM(G.Tips) FROM Gig G JOIN Platform P ON G.PlatformID = P.PlatformID GROUP BY P.PlatformName ORDER BY 2 DESC', BAR, order=True),
    q('dv26', 'sort', 3, 'Vehicles (by nickname) ordered by total expense amount, LOWEST first.', 'SELECT V.Nickname, SUM(E.Amount) FROM Expense E JOIN Vehicle V ON E.VehicleID = V.VehicleID GROUP BY V.Nickname ORDER BY 2 ASC', BAR, order=True, hints=['Bars default to descending; change the sort.']),
]

utt = [
    q('uv01', 'single-value', 1, 'Show one number: total views across every video.', 'SELECT SUM(Views) FROM Video', CARD),
    q('uv02', 'single-value', 1, 'Show one number: how many employees the company has.', 'SELECT COUNT(EmpID) FROM Employee', CARD),
    q('uv03', 'single-value', 1, 'Show one number: total sponsorship fees collected.', 'SELECT SUM(Fee) FROM Sponsorship', CARD),
    q('uv04', 'single-value', 2, 'Show one number: the longest video, in minutes.', 'SELECT MAX(DurationMin) FROM Video', CARD),
    q('uv05', 'compare', 2, 'Compare total views by channel name.', 'SELECT C.ChannelName, SUM(V.Views) FROM Video V JOIN Channel C ON V.ChannelID = C.ChannelID GROUP BY C.ChannelName', BAR),
    q('uv06', 'compare', 2, 'Compare the number of videos of each video type.', 'SELECT VideoType, COUNT(VideoID) FROM Video GROUP BY VideoType', BAR),
    q('uv07', 'compare', 2, 'Compare average views per video by video type.', 'SELECT VideoType, AVG(Views) FROM Video GROUP BY VideoType', BAR, hints=['Average, not sum.']),
    q('uv08', 'compare', 2, 'Compare total annual salary by department name.', 'SELECT D.DeptName, SUM(E.AnnualSalary) FROM Employee E JOIN Department D ON E.DeptID = D.DeptID GROUP BY D.DeptName', BAR),
    q('uv09', 'compare', 3, 'Compare total sponsorship fees by sponsor industry.', 'SELECT S.Industry, SUM(SP.Fee) FROM Sponsorship SP JOIN Sponsor S ON SP.SponsorID = S.SponsorID GROUP BY S.Industry', BAR),
    q('uv10', 'compare', 3, 'How many videos has each employee hosted? Compare by employee name.', 'SELECT E.EmpName, COUNT(V.VideoID) FROM Video V JOIN Employee E ON V.HostEmpID = E.EmpID GROUP BY E.EmpName', BAR + ['table']),
    q('uv11', 'compare', 2, 'Compare the average MSRP of products by product category.', 'SELECT Category, AVG(MSRP) FROM Product GROUP BY Category', BAR),
    q('uv12', 'trend', 2, 'Show total views per publish month over time (PublishMonth).', 'SELECT PublishMonth, SUM(Views) FROM Video GROUP BY PublishMonth', LINE),
    q('uv13', 'trend', 3, 'Show sponsorship fees over time, by the month the sponsored video was published.', 'SELECT V.PublishMonth, SUM(S.Fee) FROM Sponsorship S JOIN Video V ON S.VideoID = V.VideoID GROUP BY V.PublishMonth', LINE),
    q('uv14', 'trend', 3, 'A titled line chart of the number of videos published per month (PublishMonth).', 'SELECT PublishMonth, COUNT(VideoID) FROM Video GROUP BY PublishMonth', LINE, title=True),
    q('uv15', 'part-whole', 2, 'Show each channel\'s share of the total number of videos (by channel name).', 'SELECT C.ChannelName, COUNT(V.VideoID) FROM Video V JOIN Channel C ON V.ChannelID = C.ChannelID GROUP BY C.ChannelName', PIE),
    q('uv16', 'part-whole', 2, 'Show how sponsorship slots split between placements (count per Placement).', 'SELECT Placement, COUNT(SponsorshipID) FROM Sponsorship GROUP BY Placement', PIE),
    q('uv17', 'table', 2, 'A table of every employee: name, title and annual salary.', 'SELECT EmpName, Title, AnnualSalary FROM Employee', TABLE),
    q('uv18', 'table', 3, 'A table with one row per manufacturer: manufacturer name and number of products.', 'SELECT M.ManufacturerName, COUNT(P.ProductID) FROM Product P JOIN Manufacturer M ON P.ManufacturerID = M.ManufacturerID GROUP BY M.ManufacturerName', TABLE + BAR),
    q('uv19', 'filter', 3, 'Total views by video type, only for the channel {{channel}}.', "SELECT V.VideoType, SUM(V.Views) FROM Video V JOIN Channel C ON V.ChannelID = C.ChannelID WHERE C.ChannelName = '{{channel}}' GROUP BY V.VideoType", BAR, params={'channel': {'from': 'SELECT ChannelName FROM Channel'}}),
    q('uv20', 'filter', 3, 'Total fees by sponsor name for {{placement}} placements only.', "SELECT S.SponsorName, SUM(SP.Fee) FROM Sponsorship SP JOIN Sponsor S ON SP.SponsorID = S.SponsorID WHERE SP.Placement = '{{placement}}' GROUP BY S.SponsorName", BAR + ['table'], params={'placement': {'from': 'SELECT DISTINCT Placement FROM Sponsorship'}}),
    q('uv21', 'filter', 3, 'Number of videos per channel name, counting only videos with at least {{v}} views.', 'SELECT C.ChannelName, COUNT(V.VideoID) FROM Video V JOIN Channel C ON V.ChannelID = C.ChannelID WHERE V.Views >= {{v}} GROUP BY C.ChannelName', BAR, params={'v': {'values': ['__VIEWS__']}}),
    q('uv22', 'calc', 3, 'Total salary cost in thousands per department name: sum of AnnualSalary / 1000.0.', 'SELECT D.DeptName, SUM(E.AnnualSalary / 1000.0) FROM Employee E JOIN Department D ON E.DeptID = D.DeptID GROUP BY D.DeptName', BAR),
    q('uv23', 'calc', 4, 'Sponsorship fee per thousand views by channel name: SUM(Fee) * 1000.0 / SUM(Views).', 'SELECT C.ChannelName, SUM(S.Fee) * 1000.0 / SUM(V.Views) FROM Sponsorship S JOIN Video V ON S.VideoID = V.VideoID JOIN Channel C ON V.ChannelID = C.ChannelID GROUP BY C.ChannelName', BAR, hints=['Aggregate calculated field: the SUMs go inside the expression.']),
    q('uv24', 'calc', 3, 'Total hours of video published per channel name: sum of DurationMin / 60.0.', 'SELECT C.ChannelName, SUM(V.DurationMin / 60.0) FROM Video V JOIN Channel C ON V.ChannelID = C.ChannelID GROUP BY C.ChannelName', BAR),
    q('uv25', 'two-dim', 4, 'Number of product verdicts per manufacturer name, split by verdict.', 'SELECT M.ManufacturerName, VP.Verdict, COUNT(VP.ProductID) FROM VideoProduct VP JOIN Product P ON VP.ProductID = P.ProductID JOIN Manufacturer M ON P.ManufacturerID = M.ManufacturerID GROUP BY M.ManufacturerName, VP.Verdict', STACK),
    q('uv26', 'two-dim', 4, 'Total sponsorship fees per placement, split by sponsor industry.', 'SELECT SP.Placement, S.Industry, SUM(SP.Fee) FROM Sponsorship SP JOIN Sponsor S ON SP.SponsorID = S.SponsorID GROUP BY SP.Placement, S.Industry', STACK),
    q('uv27', 'sort', 3, 'Channels ranked by total views, highest first.', 'SELECT C.ChannelName, SUM(V.Views) FROM Video V JOIN Channel C ON V.ChannelID = C.ChannelID GROUP BY C.ChannelName ORDER BY 2 DESC', BAR, order=True),
    q('uv28', 'sort', 3, 'Sponsor industries ordered by total fee, LOWEST first.', 'SELECT S.Industry, SUM(SP.Fee) FROM Sponsorship SP JOIN Sponsor S ON SP.SponsorID = S.SponsorID GROUP BY S.Industry ORDER BY 2 ASC', BAR, order=True),
]

mega = [
    q('mv01', 'single-value', 1, 'Show one number: Mega\'s total revenue from store sales (MegaRevenue).', 'SELECT SUM(MegaRevenue) FROM StoreSale', CARD),
    q('mv02', 'single-value', 1, 'Show one number: how many customers there are.', 'SELECT COUNT(CustomerID) FROM Customer', CARD),
    q('mv03', 'single-value', 2, 'Show one number: the average review rating across all reviews.', 'SELECT AVG(Rating) FROM Review', CARD),
    q('mv04', 'single-value', 2, 'Show one number: total hardware units sold (sum of order-line quantities).', 'SELECT SUM(Quantity) FROM HardwareOrderLine', CARD),
    q('mv05', 'compare', 2, 'Compare Mega\'s store revenue (MegaRevenue) by genre name.', 'SELECT GE.GenreName, SUM(SS.MegaRevenue) FROM StoreSale SS JOIN Game G ON SS.GameID = G.GameID JOIN Genre GE ON G.GenreID = GE.GenreID GROUP BY GE.GenreName', BAR),
    q('mv06', 'compare', 2, 'Compare the number of store sales by customer tier.', 'SELECT C.Tier, COUNT(SS.SaleID) FROM StoreSale SS JOIN Customer C ON SS.CustomerID = C.CustomerID GROUP BY C.Tier', BAR),
    q('mv07', 'compare', 3, 'Compare total price paid by customers, per studio name.', 'SELECT S.StudioName, SUM(SS.PricePaid) FROM StoreSale SS JOIN Game G ON SS.GameID = G.GameID JOIN Studio S ON G.StudioID = S.StudioID GROUP BY S.StudioName', BAR),
    q('mv08', 'compare', 3, 'Compare the average rating per game title.', 'SELECT G.Title, AVG(R.Rating) FROM Review R JOIN Game G ON R.GameID = G.GameID GROUP BY G.Title', BAR + ['table']),
    q('mv09', 'compare', 2, 'Compare hardware units sold (sum of Quantity) by hardware type.', 'SELECT H.HardwareType, SUM(L.Quantity) FROM HardwareOrderLine L JOIN HardwareProduct H ON L.HardwareID = H.HardwareID GROUP BY H.HardwareType', BAR),
    q('mv10', 'compare', 2, 'Compare the number of games each studio has developed (by studio name).', 'SELECT S.StudioName, COUNT(G.GameID) FROM Game G JOIN Studio S ON G.StudioID = S.StudioID GROUP BY S.StudioName', BAR),
    q('mv11', 'compare', 3, 'Compare total credit-transaction amount by transaction type.', 'SELECT TxnType, SUM(Amount) FROM CreditTransaction GROUP BY TxnType', BAR),
    q('mv12', 'trend', 2, 'Show Mega\'s store revenue (MegaRevenue) month by month (SaleMonth).', 'SELECT SaleMonth, SUM(MegaRevenue) FROM StoreSale GROUP BY SaleMonth', LINE),
    q('mv13', 'trend', 2, 'A titled line chart of the number of hardware orders per month (OrderMonth).', 'SELECT OrderMonth, COUNT(OrderID) FROM HardwareOrder GROUP BY OrderMonth', LINE, title=True),
    q('mv14', 'trend', 3, 'Show the number of store sales per month (SaleMonth) over time.', 'SELECT SaleMonth, COUNT(SaleID) FROM StoreSale GROUP BY SaleMonth', LINE),
    q('mv15', 'part-whole', 2, 'Show each platform\'s share of the games available on it (count games per platform name).', 'SELECT P.PlatformName, COUNT(GP.GameID) FROM GamePlatform GP JOIN Platform P ON GP.PlatformID = P.PlatformID GROUP BY P.PlatformName', PIE),
    q('mv16', 'part-whole', 2, 'Show how hardware orders split across payment methods.', 'SELECT PaymentMethod, COUNT(OrderID) FROM HardwareOrder GROUP BY PaymentMethod', PIE),
    q('mv17', 'table', 2, 'A table of every game: title, release date and list price.', 'SELECT Title, ReleaseDate, ListPrice FROM Game', TABLE),
    q('mv18', 'table', 2, 'A table of hardware products: product name, unit cost and unit price.', 'SELECT ProductName, UnitCost, UnitPrice FROM HardwareProduct', TABLE),
    q('mv19', 'table', 3, 'A table with one row per country of customer: country and total price paid in the store.', 'SELECT C.Country, SUM(SS.PricePaid) FROM StoreSale SS JOIN Customer C ON SS.CustomerID = C.CustomerID GROUP BY C.Country', TABLE + BAR),
    q('mv20', 'filter', 3, 'Mega revenue by genre name, only for customers from {{country}}.', "SELECT GE.GenreName, SUM(SS.MegaRevenue) FROM StoreSale SS JOIN Game G ON SS.GameID = G.GameID JOIN Genre GE ON G.GenreID = GE.GenreID JOIN Customer C ON SS.CustomerID = C.CustomerID WHERE C.Country = '{{country}}' GROUP BY GE.GenreName", BAR, params={'country': {'from': 'SELECT DISTINCT Country FROM Customer'}}),
    q('mv21', 'filter', 3, 'Credit-transaction amount by transaction type, only for accounts whose status is {{status}}.', "SELECT T.TxnType, SUM(T.Amount) FROM CreditTransaction T JOIN CreditAccount A ON T.AccountID = A.AccountID WHERE A.Status = '{{status}}' GROUP BY T.TxnType", BAR, params={'status': {'from': 'SELECT DISTINCT A.Status FROM CreditAccount A JOIN CreditTransaction T ON T.AccountID = A.AccountID'}}),
    q('mv22', 'filter', 3, 'Hardware units (sum of Quantity) by hardware type, only for orders shipped to {{country}}.', "SELECT H.HardwareType, SUM(L.Quantity) FROM HardwareOrderLine L JOIN HardwareOrder O ON L.OrderID = O.OrderID JOIN HardwareProduct H ON L.HardwareID = H.HardwareID WHERE O.ShipCountry = '{{country}}' GROUP BY H.HardwareType", BAR, params={'country': {'from': 'SELECT DISTINCT ShipCountry FROM HardwareOrder'}}),
    q('mv23', 'filter', 4, 'Monthly Mega revenue (SaleMonth) for games published by Mega only (PublishedByMega = 1).', 'SELECT SS.SaleMonth, SUM(SS.MegaRevenue) FROM StoreSale SS JOIN Game G ON SS.GameID = G.GameID WHERE G.PublishedByMega = 1 GROUP BY SS.SaleMonth', LINE, hints=['PublishedByMega is a 0/1 flag: filter it to 1.']),
    q('mv24', 'calc', 3, 'Hardware line revenue per hardware type: sum of Quantity * UnitPricePaid.', 'SELECT H.HardwareType, SUM(L.Quantity * L.UnitPricePaid) FROM HardwareOrderLine L JOIN HardwareProduct H ON L.HardwareID = H.HardwareID GROUP BY H.HardwareType', BAR),
    q('mv25', 'calc', 4, 'Hardware profit per product name: sum of Quantity * (UnitPricePaid - UnitCost).', 'SELECT H.ProductName, SUM(L.Quantity * (L.UnitPricePaid - H.UnitCost)) FROM HardwareOrderLine L JOIN HardwareProduct H ON L.HardwareID = H.HardwareID GROUP BY H.ProductName', BAR + ['table'], hints=['The expression uses columns from two tables; that is fine.']),
    q('mv26', 'calc', 4, 'Mega\'s share of the price paid, per studio name, in percent: SUM(MegaRevenue) * 100.0 / SUM(PricePaid).', 'SELECT S.StudioName, SUM(SS.MegaRevenue) * 100.0 / SUM(SS.PricePaid) FROM StoreSale SS JOIN Game G ON SS.GameID = G.GameID JOIN Studio S ON G.StudioID = S.StudioID GROUP BY S.StudioName', BAR),
    q('mv27', 'two-dim', 4, 'Hardware units (sum of Quantity) per ship country, split by hardware type.', 'SELECT O.ShipCountry, H.HardwareType, SUM(L.Quantity) FROM HardwareOrderLine L JOIN HardwareOrder O ON L.OrderID = O.OrderID JOIN HardwareProduct H ON L.HardwareID = H.HardwareID GROUP BY O.ShipCountry, H.HardwareType', STACK),
    q('mv28', 'two-dim', 4, 'Mega revenue per genre name, split by customer tier.', 'SELECT GE.GenreName, C.Tier, SUM(SS.MegaRevenue) FROM StoreSale SS JOIN Game G ON SS.GameID = G.GameID JOIN Genre GE ON G.GenreID = GE.GenreID JOIN Customer C ON SS.CustomerID = C.CustomerID GROUP BY GE.GenreName, C.Tier', STACK),
    q('mv29', 'sort', 3, 'Studios ranked by total price paid in the store, highest first.', 'SELECT S.StudioName, SUM(SS.PricePaid) FROM StoreSale SS JOIN Game G ON SS.GameID = G.GameID JOIN Studio S ON G.StudioID = S.StudioID GROUP BY S.StudioName ORDER BY 2 DESC', BAR, order=True),
    q('mv30', 'sort', 3, 'Hardware types ordered by total line revenue (Quantity * UnitPricePaid), LOWEST first.', 'SELECT H.HardwareType, SUM(L.Quantity * L.UnitPricePaid) FROM HardwareOrderLine L JOIN HardwareProduct H ON L.HardwareID = H.HardwareID GROUP BY H.HardwareType ORDER BY 2 ASC', BAR, order=True),
]

riverbend = [
    q('rv01', 'single-value', 1, 'Show one number: total revenue (sum of LineTotal).', 'SELECT SUM(LineTotal) FROM SoldVia', CARD),
    q('rv02', 'single-value', 1, 'Show one number: the number of sales transactions.', 'SELECT COUNT(TID) FROM SalesTransaction', CARD),
    q('rv03', 'compare', 2, 'Compare revenue (LineTotal) by category name.', 'SELECT C.CategoryName, SUM(S.LineTotal) FROM SoldVia S JOIN Product P ON S.ProductID = P.ProductID JOIN Category C ON P.CategoryID = C.CategoryID GROUP BY C.CategoryName', BAR),
    q('rv04', 'compare', 2, 'Compare units sold (Quantity) by vendor name.', 'SELECT V.VendorName, SUM(S.Quantity) FROM SoldVia S JOIN Product P ON S.ProductID = P.ProductID JOIN Vendor V ON P.VendorID = V.VendorID GROUP BY V.VendorName', BAR),
    q('rv05', 'trend', 2, 'Show monthly revenue (LineTotal by TMonth) over time.', 'SELECT T.TMonth, SUM(S.LineTotal) FROM SalesTransaction T JOIN SoldVia S ON T.TID = S.TID GROUP BY T.TMonth', LINE),
    q('rv06', 'part-whole', 2, 'Show each region\'s share of transactions (count by region name).', 'SELECT R.RegionName, COUNT(T.TID) FROM SalesTransaction T JOIN Store S ON T.StoreID = S.StoreID JOIN Region R ON S.RegionID = R.RegionID GROUP BY R.RegionName', PIE),
    q('rv07', 'table', 2, 'A table of products: product name and price.', 'SELECT ProductName, Price FROM Product', TABLE),
    q('rv08', 'filter', 3, 'Revenue by store name, only for stores in the {{region}} region.', "SELECT S.StoreName, SUM(SV.LineTotal) FROM SoldVia SV JOIN SalesTransaction T ON SV.TID = T.TID JOIN Store S ON T.StoreID = S.StoreID JOIN Region R ON S.RegionID = R.RegionID WHERE R.RegionName = '{{region}}' GROUP BY S.StoreName", BAR, params={'region': {'from': 'SELECT RegionName FROM Region'}}),
    q('rv09', 'calc', 3, 'Average line value per category name: SUM(LineTotal) / SUM(Quantity).', 'SELECT C.CategoryName, SUM(S.LineTotal) / SUM(S.Quantity) FROM SoldVia S JOIN Product P ON S.ProductID = P.ProductID JOIN Category C ON P.CategoryID = C.CategoryID GROUP BY C.CategoryName', BAR),
    q('rv10', 'two-dim', 4, 'Revenue (LineTotal) per category name, split by region name.', 'SELECT C.CategoryName, R.RegionName, SUM(SV.LineTotal) FROM SoldVia SV JOIN Product P ON SV.ProductID = P.ProductID JOIN Category C ON P.CategoryID = C.CategoryID JOIN SalesTransaction T ON SV.TID = T.TID JOIN Store S ON T.StoreID = S.StoreID JOIN Region R ON S.RegionID = R.RegionID GROUP BY C.CategoryName, R.RegionName', STACK),
    q('rv11', 'sort', 3, 'Stores ranked by revenue (LineTotal), highest first.', 'SELECT S.StoreName, SUM(SV.LineTotal) FROM SoldVia SV JOIN SalesTransaction T ON SV.TID = T.TID JOIN Store S ON T.StoreID = S.StoreID GROUP BY S.StoreName ORDER BY 2 DESC', BAR, order=True),
]

SETS = {
    'dave': ('dave-viz-sprint', 'dave', "Dave's Gig Log — viz sprint", 'dave', dave),
    'utt': ('utt-viz-sprint', 'utt', 'Ulysses Tech Tips — viz sprint', 'utt', utt),
    'mega': ('mega-viz-sprint', 'mega', 'Mega EpicGames — viz sprint', 'mega', mega),
    'riverbend': ('riverbend-viz-sprint', 'riverbend', 'Riverbend Cycles — viz sprint', 'riverbend', riverbend),
}

for pack, (sid, company, title, dbid, qs) in SETS.items():
    con = db_for(pack)
    # data-driven thresholds
    if pack == 'utt':
        views = [r[0] for r in con.execute('SELECT Views FROM Video ORDER BY Views')]
        p = lambda f: int(round(views[int(len(views) * f)], -3))
        for t in qs:
            if t['id'] == 'uv21':
                t['params'] = {'v': {'values': [p(0.5), p(0.75), p(0.9)]}}
    # smoke-test every template
    for t in qs:
        for _ in range(4):
            vals = {}
            for k, pr in (t.get('params') or {}).items():
                if 'values' in pr:
                    vals[k] = random.choice(pr['values'])
                else:
                    rows = con.execute(pr['from']).fetchall()
                    vals[k] = random.choice(rows)[0]
            sql = re.sub(r'\{\{(\w+)\}\}', lambda m: str(vals[m.group(1)]), t['sql'])
            rows = con.execute(sql).fetchall()
            assert rows, f'{pack}/{t["id"]} produced no rows: {sql}'
    path = f'public/packs/{pack}-challenges.json'
    doc = json.load(open(path))
    doc['vizSprints'] = [{'id': sid, 'company': company, 'title': title, 'database': dbid, 'questions': qs}]
    json.dump(doc, open(path, 'w'), indent=2, ensure_ascii=False)
    open(path, 'a').write('\n')
    print(pack, len(qs), 'templates written')
