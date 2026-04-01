import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { resolveImageUrl } from './ImageUpload';
import { formatTime } from '../utils/formatTime';
import axios from 'axios';
import API_URL from '../config/api';
import './RentalAgreement.css';

const RentalAgreement = ({ bookingId, onAgreementSigned, readOnly = false }) => {
  const { user } = useAuth();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signature, setSignature] = useState('');
  const [signatureImage, setSignatureImage] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const canvasRef = useRef(null);
  const [signing, setSigning] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    fetchAgreementData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const fetchAgreementData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/agreements/${bookingId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBooking(response.data);

      const agreement = response.data.agreement;
      if (agreement && agreement.driverSignature) {
        setSignature(agreement.driverSignature);
      }
      if (agreement && agreement.signatureImage) {
        setSignatureImage(agreement.signatureImage);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load agreement data');
    } finally {
      setLoading(false);
    }
  };

  // Canvas signature pad methods
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    if (!loading && !booking?.agreement?.signed && !readOnly) {
      // Small delay to ensure canvas is in DOM
      const timer = setTimeout(initCanvas, 100);
      return () => clearTimeout(timer);
    }
  }, [loading, booking, readOnly, initCanvas]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = (e) => {
    if (e) e.preventDefault();
    setIsDrawing(false);
  };

  const clearSignaturePad = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const getSignatureDataUrl = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return '';
    return canvas.toDataURL('image/png');
  };

  const handleSign = async () => {
    if (!hasDrawn) {
      setError('Please draw your signature above');
      return;
    }
    if (!signature.trim()) {
      setError('Please type your full legal name below');
      return;
    }
    if (!agreed) {
      setError('Please check the box to confirm you agree to the terms');
      return;
    }

    setSigning(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const sigImage = getSignatureDataUrl();
      await axios.post(`${API_URL}/api/agreements/${bookingId}/sign`, {
        signature: signature.trim(),
        signatureImage: sigImage
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Refresh data
      await fetchAgreementData();

      if (onAgreementSigned) {
        onAgreementSigned();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to sign agreement');
    } finally {
      setSigning(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      .toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
  };

  const formatDateTime = (dateStr, time) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    const dateFormatted = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      .toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
    return time ? `${dateFormatted} at ${formatTime(time)}` : dateFormatted;
  };

  if (loading) {
    return (
      <div className="agreement-loading">
        <div className="spinner"></div>
        <p>Loading rental agreement...</p>
      </div>
    );
  }

  if (error && !booking) {
    return <div className="agreement-error">{error}</div>;
  }

  if (!booking) return null;

  const vehicle = booking.vehicle;
  const driver = booking.driver;
  const host = booking.host;
  const isSigned = booking.agreement && booking.agreement.signed;
  const agreementData = booking.agreement || {};
  const driverAddress = driver?.address || agreementData.driverAddressAtSigning;

  // Calculate current terms (including extensions)
  const currentEndDate = booking.endDate;
  const currentTotalDays = booking.totalDays;
  const currentTotalPrice = booking.totalPrice;

  // Calculate days late (only for active bookings past end date)
  const now = new Date();
  const endDate = new Date(currentEndDate);
  const daysLate = booking.status === 'active' && now > endDate
    ? Math.round(((now - endDate) / (1000 * 60 * 60 * 24)) * 10) / 10
    : 0;

  return (
    <div className="rental-agreement">
      <div className="agreement-document">
        {/* Header */}
        <h1 className="agreement-title">CAR RENTAL AGREEMENT</h1>

        <p className="agreement-intro">
          The Gleizer Group, LLC dba United Fleet Services ("RentUFS.com") is a car sharing platform
          that connects vehicle owners ("Owner") with drivers ("Renter") looking to rent a vehicle.
          RentUFS.com does not own any vehicles and is not a party to this agreement. The term of this
          Rental Agreement runs from the date and time listed below to the end of the last extension.
          This is a living agreement that gets updated each time a rental extension or car swap is made.
        </p>

        {/* INVOLVED PARTIES */}
        <h2 className="agreement-section-title">INVOLVED PARTIES</h2>

        {/* Owner & Vehicle */}
        <div className="agreement-party-section">
          <h3 className="agreement-party-title">OWNER & VEHICLE</h3>
          <div className="agreement-fields">
            <div className="agreement-field">
              <span className="field-label">Name:</span>
              <span className="field-value">{host?.firstName} {host?.lastName}</span>
            </div>
            <div className="agreement-field">
              <span className="field-label">Vehicle:</span>
              <span className="field-value">{vehicle?.year} {vehicle?.make} {vehicle?.model}</span>
            </div>
            <div className="agreement-field">
              <span className="field-label">VIN:</span>
              <span className="field-value">{vehicle?.vin || 'N/A'}</span>
            </div>
            <div className="agreement-field">
              <span className="field-label">License Plate:</span>
              <span className="field-value">{vehicle?.licensePlate || 'N/A'}</span>
            </div>
            <div className="agreement-field">
              <span className="field-label">Registered State:</span>
              <span className="field-value">{vehicle?.location?.state || 'N/A'}</span>
            </div>
            <div className="agreement-field">
              <span className="field-label">Existing Damage:</span>
              <span className="field-value">
                {booking.pickupInspection?.notes || 'None Reported'}
              </span>
            </div>
          </div>
        </div>

        {/* Renter */}
        <div className="agreement-party-section">
          <h3 className="agreement-party-title">RENTER</h3>
          <div className="agreement-fields">
            <div className="agreement-field">
              <span className="field-label">Name:</span>
              <span className="field-value">{driver?.firstName} {driver?.lastName}</span>
            </div>
            <div className="agreement-field">
              <span className="field-label">Address:</span>
              <span className="field-value">
                {driverAddress?.street
                  ? `${driverAddress.street}${driverAddress.apt ? `, ${driverAddress.apt}` : ''}, ${driverAddress.city}, ${driverAddress.state} ${driverAddress.zipCode}`
                  : 'To be provided at signing'}
              </span>
            </div>
            <div className="agreement-field">
              <span className="field-label">Contact:</span>
              <span className="field-value">{driver?.email}  {driver?.phone}</span>
            </div>
            <div className="agreement-field">
              <span className="field-label">Driver's License:</span>
              <span className="field-value">
                {driver?.driverLicense?.state} {driver?.driverLicense?.licenseNumber || 'N/A'}
              </span>
            </div>
            <div className="agreement-field">
              <span className="field-label">EXP:</span>
              <span className="field-value">
                {driver?.driverLicense?.expirationDate
                  ? formatDate(driver.driverLicense.expirationDate)
                  : 'N/A'}
              </span>
            </div>
            <div className="agreement-field">
              <span className="field-label">DOB:</span>
              <span className="field-value">
                {driver?.dateOfBirth ? formatDate(driver.dateOfBirth) : 'N/A'}
              </span>
            </div>
          </div>

          {/* License Image */}
          {driver?.driverLicense?.licenseImage && (
            <div className="agreement-license-image">
              <img
                src={resolveImageUrl(driver.driverLicense.licenseImage)}
                alt="Driver's License"
              />
            </div>
          )}
        </div>

        {/* RENTAL DETAILS */}
        <h2 className="agreement-section-title">RENTAL DETAILS</h2>
        <div className="agreement-fields">
          <div className="agreement-field">
            <span className="field-label">Booking Number:</span>
            <span className="field-value">{booking.reservationId || `#${booking._id?.slice(-8).toUpperCase()}`}</span>
          </div>
          <div className="agreement-field">
            <span className="field-label">Start Date / Time:</span>
            <span className="field-value">
              {formatDateTime(booking.startDate, booking.pickupTime)}
            </span>
          </div>
          <div className="agreement-field">
            <span className="field-label">End Date / Time:</span>
            <span className="field-value">
              {formatDateTime(currentEndDate, booking.dropoffTime || booking.pickupTime)}
            </span>
          </div>
          <div className="agreement-field">
            <span className="field-label">Days Rented:</span>
            <span className="field-value">{currentTotalDays}</span>
          </div>
          {daysLate > 0 && (
            <div className="agreement-field">
              <span className="field-label">Days Late:</span>
              <span className="field-value">{daysLate}</span>
            </div>
          )}
          <div className="agreement-field">
            <span className="field-label">Daily Mileage Max:</span>
            <span className="field-value">Unlimited</span>
          </div>
          <div className="agreement-field">
            <span className="field-label">Extensions Allowed:</span>
            <span className="field-value">Yes</span>
          </div>
          <div className="agreement-field">
            <span className="field-label">Daily Rental Price:</span>
            <span className="field-value">${booking.pricePerDay?.toFixed(2)}</span>
          </div>
          {booking.insurance && booking.insurance.type !== 'none' && (
            <div className="agreement-field">
              <span className="field-label">Daily Coverage Fee:</span>
              <span className="field-value">${booking.insurance.costPerDay?.toFixed(2)}</span>
            </div>
          )}
          <div className="agreement-field">
            <span className="field-label">Rental Status:</span>
            <span className="field-value" style={{ textTransform: 'capitalize' }}>
              {booking.status}
            </span>
          </div>
          <div className="agreement-field">
            <span className="field-label">Location:</span>
            <span className="field-value">
              {vehicle?.location?.address && `${vehicle.location.address}, `}
              {vehicle?.location?.city}, {vehicle?.location?.state} {vehicle?.location?.zipCode}
            </span>
          </div>
        </div>

        {/* Extension History */}
        {booking.extensions && booking.extensions.length > 0 && (
          <div className="agreement-extensions">
            <h3 className="agreement-subsection-title">EXTENSION HISTORY</h3>
            <table className="agreement-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Days Added</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {booking.extensions.map((ext, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>{new Date(ext.extendedAt).toLocaleDateString('en-US')}</td>
                    <td>{ext.days}</td>
                    <td>${ext.cost?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Vehicle Switch History */}
        {booking.vehicleSwitchHistory && booking.vehicleSwitchHistory.length > 0 && (
          <div className="agreement-extensions">
            <h3 className="agreement-subsection-title">VEHICLE SWAP HISTORY</h3>
            {booking.vehicleSwitchHistory.map((sw, idx) => (
              <div key={idx} className="agreement-field">
                <span className="field-label">Swap {idx + 1}:</span>
                <span className="field-value">
                  {new Date(sw.switchedAt).toLocaleDateString('en-US')} - {sw.reason || 'Vehicle changed'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* TERMS AND CONDITIONS */}
        <h2 className="agreement-section-title">TERMS AND CONDITIONS</h2>
        <div className="agreement-terms">
          <ol>
            <li>
              <strong>Term.</strong> This rental agreement will become active either at the Start
              Date & Time listed in the Rental Details or at the Date & Time that the renter takes
              possession of the vehicle as described in the Rental Details.
            </li>
            <li>
              <strong>Payments & Charges.</strong> Renter is responsible for paying the Daily Rental
              Price and Security Deposit (if applicable) prior to the start of the Rental Agreement.
              Owner will be responsible to pay any local, state or federal income taxes. Renter will
              keep a valid payment method on file with RentUFS.com and authorizes RentUFS.com to
              process any additional amounts due for Rental Extensions, late fees, fines, or valid
              additional charges. RentUFS.com will process payment for any unpaid charges due upon
              return of the Vehicle, including but not limited to:
              <ol type="a">
                <li>
                  All fines, penalties, traffic violations, parking violations, toll fees, towing
                  and/or impound charges, court fees and other fees incurred during the Rental Term,
                  unless due to the fault of the Owner.
                </li>
                <li>
                  All costs incurred to collect unpaid amounts due including debt collection, agency
                  or attorney fees, or any other third-party costs.
                </li>
              </ol>
            </li>
            <li>
              <strong>Permissible Vehicle Use.</strong> Vehicle is strictly to be used for the
              purpose described in the Rental Agreement. 'Personal Use' prohibits any use of Vehicle
              for business or gig-economy purposes. 'Gig Use' or 'Rideshare Use' allows the Renter
              to use the Vehicle in a business capacity with any third-party Transportation Network
              Company (TNC) or Delivery Network Company (DNC). Passenger transportation for-hire is
              prohibited unless facilitated by a TNC that provides coverage for the passenger when in
              transport.
            </li>
            <li>
              <strong>Owner Cancellation.</strong> The Owner at their discretion may cancel the
              rental after owner approval and prior to pickup. If this occurs a full refund of all
              rental fees shall be given to the renter. RentUFS.com may withhold the platform fee
              from the owner during future rental payouts.
            </li>
            <li>
              <strong>Renter Cancellation.</strong> A Renter may cancel a rental at their discretion,
              provided the Owner has not yet approved and it occurs before the scheduled pickup. In
              such cases, the Renter will receive a full refund of the rental cost, minus:
              <ol type="a">
                <li>The RentUFS.com Per Rental Day Transaction Fee</li>
                <li>Any Credit Card Processing Fees</li>
              </ol>
            </li>
            <li>
              <strong>Authorized Drivers.</strong> Driver listed in this Agreement is the only
              authorized person to operate the Vehicle. Driver is required to keep their license valid
              during the entire Rental Term. Driver is responsible for any use of the Vehicle by
              another person, including if the Vehicle is lost or stolen.
            </li>
            <li>
              <strong>Rental Term Extension.</strong> Vehicle Owner may allow the Rental Term to be
              extended at the Owner's discretion. If an Owner and Driver agree to extend the Rental
              Term End Date & Time, the Term of this Agreement will automatically extend to match the
              new end date or until the Vehicle is returned to the Owner. The Renter will be charged
              any additional costs associated with the Rental Term Extension at the time accepted by
              both parties.
            </li>
            <li>
              <strong>Automatic Late Extension.</strong> If the rental Vehicle is not returned within
              24 hours of the original or extended End Date & Time, an Automatic Late Extension shall be applied.
              The Renter's payment method on file will be charged at the current day's rental fee
              plus any applicable fees. If the payment attempt fails for any reason, the Renter must
              extend the rental through the RentUFS.com website or return the vehicle immediately.
            </li>
            <li>
              <strong>Vehicles Not Returned.</strong> If the Vehicle is not returned within 72 hours
              of the End Date & Time and if the Rental Agreement has not been voluntarily Extended,
              the Owner may do one or more of the following at the Owner's expense:
              <ol type="a">
                <li>Report the Vehicle as stolen to local law enforcement.</li>
                <li>Repossess the vehicle.</li>
              </ol>
            </li>
            <li>
              <strong>Financial Responsibility.</strong> Owner is required to adhere to the financial
              responsibility laws set forth by the jurisdiction where the vehicle is registered. Proof
              of Financial Responsibility must be kept on file with the governing authority throughout
              the duration of the Rental Term. RentUFS.com's insurance policy does not provide the
              Financial Responsibility coverage needed to keep the Vehicle registration or tags valid
              with the State.
            </li>
            <li>
              <strong>RentUFS.com Insurance Coverage.</strong> Coverage is provided by RentUFS.com
              strictly while the Vehicle is operating under Period Zero™ as defined below:
              <ol type="a">
                <li>Off Rent™ - Vehicle is not rented and is in the Owner's possession.</li>
                <li>
                  Period Zero™ - Active Rental Agreement is in place and Vehicle is in Renter's
                  possession. Any third-party TNC or DNC mobile application is turned off.
                </li>
                <li>
                  Period 1 - Renter is operating vehicle with a third-party TNC or DNC turned ON but
                  has not been paired with a passenger or trip.
                </li>
                <li>
                  Period 2 - Renter is operating vehicle, has accepted a trip from a third-party TNC
                  or DNC and is enroute to pick up passenger(s) or delivery(ies).
                </li>
                <li>
                  Period 3 - Renter is operating vehicle with TNC or DNC connected passenger(s) or
                  delivery(ies) in vehicle.
                </li>
              </ol>
            </li>
            <li>
              <strong>Third-Party Insurance.</strong> Any insurance provided by a third-party TNC or
              DNC will be primary while the Renter is contracted in a ride or delivery through the
              third-party's software platform.
            </li>
            <li>
              <strong>Vehicle Use Restriction.</strong> Coverage will not be valid if the Vehicle is
              used in the following capacities:
              <ol type="a">
                <li>Operated by a person not listed as an authorized driver.</li>
                <li>Operating to commit any violation of the law.</li>
                <li>
                  Operating in violation of the law, including but not limited to, driving under the
                  influence, or any local, state or federal traffic laws.
                </li>
                <li>
                  Operating to carry any hazardous, biohazardous, explosive or illegal substances or
                  items.
                </li>
                <li>Operating in any race, test or contest.</li>
                <li>
                  Allowing any passenger or person to smoke tobacco or marijuana, ingest alcohol or
                  illegal substances, or commit any illegal act in the Vehicle.
                </li>
                <li>
                  Operating or parking the vehicle in any unsafe area where the Vehicle is likely to
                  be damaged.
                </li>
              </ol>
            </li>
            <li>
              <strong>Vehicle Maintenance.</strong> Owner represents that the vehicle is in sound and
              safe condition and free of any known faults or defects that would affect its safe
              operation under normal use. Owner is required to perform regular vehicle maintenance in
              accordance with the manufacturer's maintenance schedule. Records of any service
              performed to the Vehicle should be kept on file.
            </li>
            <li>
              <strong>Vehicle Repairs or Damage.</strong> At no time shall the Renter repair or
              provide service to the Vehicle unless written consent is given by the Owner. Driver must
              notify the Owner of any damage that occurs to the vehicle immediately.
            </li>
            <li>
              <strong>Vehicle Condition.</strong> Both Driver and Owner confirm that the Vehicle is in good
              condition. If any existing damage is present, it shall be disclosed in the Existing Damage
              section of the Rental Agreement. Coverage will not be valid if the Owner fails to provide
              pictures of the Vehicle condition at the Start Date & Time of the Rental Agreement. It is
              highly encouraged for the Driver to take pictures as well in order to avoid any potential
              dispute at a later date.
            </li>
            <li>
              <strong>Driver Verification.</strong> The Owner is responsible to verify that the Renter's
              Driver's License is valid and that the picture on the Driver's License matches the person
              picking up the vehicle.
            </li>
            <li>
              <strong>Motor Vehicle Report (MVR) Disclosure and Consent.</strong> As part of your
              eligibility to rent a vehicle from Owner, RentUFS may obtain one or more motor vehicle
              reports (MVRs) about you from a consumer reporting agency. This may include your driving
              history, license status, and any infractions or violations as permitted by law.
              <br /><br />
              This information will be used solely to determine your eligibility to rent a vehicle. It
              will not be shared with third parties except as required by law or to fulfill your rental
              request.
              <br /><br />
              <strong>State-Specific Notices:</strong>
              <ol type="a" style={{marginTop: '5px', marginBottom: '5px'}}>
                <li>
                  <strong>Pennsylvania:</strong> This authorization applies specifically to records
                  maintained by the Pennsylvania Department of Transportation.
                </li>
                <li>
                  <strong>Utah:</strong> This consent includes release of records maintained by the Utah
                  Department of Public Safety.
                </li>
                <li>
                  <strong>Washington:</strong> This report may include information covered under RCW
                  46.52.130, and you are entitled to a copy upon request.
                </li>
              </ol>
            </li>
            <li>
              <strong>GPS and Telematics.</strong> Vehicles may be equipped with GPS, telematic technology
              or vehicle disabling technology ("Starter Interrupts"). Renter shall not tamper with,
              disable, or interfere with any such technology installed in the Vehicle.
            </li>
          </ol>
        </div>

        {/* Signature Section */}
        {isSigned ? (
          <div className="agreement-signed-section">
            <h2 className="agreement-section-title">AGREEMENT SIGNATURE</h2>
            <div className="agreement-signed-info">
              {agreementData.signatureImage && (
                <div className="agreement-signature-image-display">
                  <span className="field-label">Signature:</span>
                  <img
                    src={agreementData.signatureImage}
                    alt="Driver Signature"
                    className="signature-image"
                  />
                </div>
              )}
              <div className="agreement-field">
                <span className="field-label">Full Legal Name:</span>
                <span className="field-value signature-display">
                  {agreementData.driverSignature}
                </span>
              </div>
              <div className="agreement-field">
                <span className="field-label">Date Signed:</span>
                <span className="field-value">
                  {new Date(agreementData.signedAt).toLocaleString('en-US')}
                </span>
              </div>
            </div>
          </div>
        ) : !readOnly && (
          <div className="agreement-sign-section">
            <h2 className="agreement-section-title">SIGN AGREEMENT</h2>

            {error && <div className="agreement-sign-error">{error}</div>}

            <p className="agreement-sign-instructions">
              Please sign with your finger or mouse below, then type your full legal name to confirm.
            </p>

            {/* Canvas Signature Pad */}
            <div className="agreement-signature-pad">
              <label>Draw Your Signature *</label>
              <div className="signature-canvas-wrapper">
                <canvas
                  ref={canvasRef}
                  className="signature-canvas"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                {!hasDrawn && (
                  <div className="signature-canvas-placeholder">
                    Sign here
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={clearSignaturePad}
                className="signature-clear-button"
              >
                Clear
              </button>
            </div>

            {/* Typed Full Legal Name */}
            <div className="agreement-signature-input">
              <label>Type Your Full Legal Name *</label>
              <input
                type="text"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="e.g., John A. Smith"
                className="signature-input"
              />
            </div>

            {/* Agree checkbox */}
            <label className="agreement-checkbox-label">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                I have read and agree to all terms and conditions in this Rental Agreement. I
                understand this is a legally binding contract.
              </span>
            </label>

            <button
              onClick={handleSign}
              disabled={signing || !signature.trim() || !hasDrawn || !agreed}
              className="agreement-sign-button"
            >
              {signing ? 'Signing...' : 'Sign Agreement'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RentalAgreement;
