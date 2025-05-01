document.addEventListener('DOMContentLoaded', () => {
    const token = new URLSearchParams(window.location.search).get('token');
    const authSection = document.getElementById('auth-section');
    const dashboard = document.getElementById('dashboard');
    const sessionTime = document.getElementById('session-time');
    const timezoneSelect = document.getElementById('timezone-select');
    const providerLabel = document.getElementById('provider-label');
    const providerBadge = document.getElementById('provider-badge');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    let sessionTimeout;
    let currentProvider = localStorage.getItem('provider') || 'google';

    // Initialize timezone selector
    function initializeTimezoneSelector() {
        const timezoneSelect = document.getElementById('timezone-select');
        
        // Get user's time zone using Intl
        let userTimezone;
        try {
            userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (e) {
            console.warn('Could not detect timezone automatically:', e);
            userTimezone = 'UTC';
        }
        
        console.log('Detected user timezone:', userTimezone);
        
        // Common timezones
        const commonTimezones = [
            { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
            { value: 'America/New_York', label: 'New York (EST/EDT)' },
            { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
            { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
            { value: 'Europe/London', label: 'London (GMT/BST)' },
            { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
            { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
            { value: 'Asia/Kolkata', label: 'India (IST)' },
            { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
            { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' }
        ];
        
        // Clear existing options
        timezoneSelect.innerHTML = '';
        
        // Add user's timezone at the top if it's not in common timezones
        const isUserTimezoneCommon = commonTimezones.some(tz => tz.value === userTimezone);
        if (!isUserTimezoneCommon) {
            const option = document.createElement('option');
            option.value = userTimezone;
            
            // Format the timezone name for display
            const formattedName = userTimezone.replace('_', ' ').replace('/', ': ');
            option.textContent = `${formattedName} (Your Local)`;
            
            option.selected = true;
            timezoneSelect.appendChild(option);
        }
        
        // Add common timezones
        commonTimezones.forEach(tz => {
            const option = document.createElement('option');
            option.value = tz.value;
            option.textContent = tz.label;
            
            // Select user's timezone if it's in common timezones
            if (tz.value === userTimezone) {
                option.selected = true;
                option.textContent += ' (Your Local)';
            }
            
            timezoneSelect.appendChild(option);
        });
        
        // Add current offset information to user's selection
        updateTimezoneOffsetInfo();
        
        // Update offset info when timezone is changed
        timezoneSelect.addEventListener('change', updateTimezoneOffsetInfo);
    }

    function formatTimezoneName(zone) {
        const now = window.DateTime.now().setZone(zone);
        const offset = now.toFormat('ZZ');
        const zoneName = zone.split('/').pop().replace('_', ' ');
        return `${zoneName} (${offset})`;
    }

    // Add timezone change handler
    timezoneSelect.addEventListener('change', (e) => {
        localStorage.setItem('selectedTimezone', e.target.value);
        showSuccess(`Timezone updated to ${e.target.options[e.target.selectedIndex].text}`);
        refreshCalendar(); // Refresh calendar to show times in new timezone
    });

    // Update provider label
    function updateProviderLabel() {
        const provider = currentProvider === 'microsoft' ? 'Microsoft Teams' : 'Google Meet';
        providerLabel.textContent = provider;
        providerLabel.className = currentProvider === 'microsoft' ? 'microsoft' : 'google';
    }

    // Toast Notifications
    function showError(message, duration = 5000) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        
        // Add animation class
        errorMessage.classList.add('animate-in');
        
        setTimeout(() => {
            errorMessage.classList.remove('animate-in');
            errorMessage.classList.add('animate-out');
            
            setTimeout(() => {
                errorMessage.style.display = 'none';
                errorMessage.classList.remove('animate-out');
            }, 300);
        }, duration);
    }

    function showSuccess(message, duration = 3000) {
        successMessage.textContent = message;
        successMessage.style.display = 'block';
        
        // Add animation class
        successMessage.classList.add('animate-in');
        
        setTimeout(() => {
            successMessage.classList.remove('animate-in');
            successMessage.classList.add('animate-out');
            
            setTimeout(() => {
                successMessage.style.display = 'none';
                successMessage.classList.remove('animate-out');
            }, 300);
        }, duration);
    }

    if (token) {
        localStorage.setItem('jwt', token);
        
        // Detect provider from URL
        const urlParams = new URLSearchParams(window.location.search);
        const provider = urlParams.get('provider') || 'google';
        localStorage.setItem('provider', provider);
        currentProvider = provider;
        
        window.history.replaceState({}, document.title, '/');
        showDashboard();
        showSuccess(`Successfully logged in with ${currentProvider === 'microsoft' ? 'Microsoft' : 'Google'}`);
    } else if (localStorage.getItem('jwt')) {
        currentProvider = localStorage.getItem('provider') || 'google';
        showDashboard();
    }

    document.getElementById('login-google-btn').addEventListener('click', () => {
        window.location.href = '/auth/google';
    });

    document.getElementById('login-microsoft-btn').addEventListener('click', () => {
        window.location.href = '/auth/microsoft';
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            await fetch('/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('jwt')}` },
            });
            localStorage.removeItem('jwt');
            localStorage.removeItem('provider');
            clearTimeout(sessionTimeout);
            showAuthSection();
            showSuccess('Successfully logged out');
        } catch (error) {
            showError('Logout failed: ' + error.message);
        }
    });

    document.getElementById('meeting-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scheduling...';
        
        const summary = document.getElementById('meeting-summary').value;
        const startLocal = document.getElementById('meeting-start').value;
        const endLocal = document.getElementById('meeting-end').value;
        const attendees = document.getElementById('meeting-attendees').value.split(',').map(email => email.trim());
        const timezone = localStorage.getItem('selectedTimezone') || 
                         Intl.DateTimeFormat().resolvedOptions().timeZone || 
                         'UTC';

        try {
            // Format dates properly for Calendar API
            // Ensure dates have timezone information
            let start = window.DateTime.fromISO(startLocal);
            if (!start.isValid) {
                throw new Error('Invalid start date format');
            }
            
            let end = window.DateTime.fromISO(endLocal);
            if (!end.isValid) {
                throw new Error('Invalid end date format');
            }
            
            // Set timezone if not present
            if (!start.zoneName) {
                start = start.setZone(timezone);
            }
            
            if (!end.zoneName) {
                end = end.setZone(timezone);
            }
            
            // Format event data based on provider
            let eventData;
            
            if (currentProvider === 'microsoft') {
                // Microsoft format
                eventData = {
                    summary: summary,
                    start: start.toISO(),
                    end: end.toISO(),
                    attendees: attendees.filter(email => email)
                };
            } else {
                // Google format with consistent dateTime format
                eventData = {
                    summary,
                    start: { 
                        dateTime: start.toISO(), 
                        timeZone: timezone 
                    },
                    end: { 
                        dateTime: end.toISO(), 
                        timeZone: timezone 
                    },
                    attendees: attendees.filter(email => email).map(email => ({ email }))
                };
            }
            
            // Determine endpoint based on provider
            const endpoint = currentProvider === 'microsoft' ? 
                             '/microsoft/calendar/events' : 
                             '/calendar/events';
            
            console.log(`Sending meeting data to ${endpoint}:`, JSON.stringify(eventData, null, 2));

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('jwt')}`
                },
                body: JSON.stringify(eventData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Failed to schedule meeting');
            }

            const data = await response.json();
            // Extract meeting link if available
            const meetingLink = currentProvider === 'microsoft' ? 
                (data.onlineMeeting?.joinUrl || 'Check Outlook for Teams link') : 
                (data.hangoutLink || 'Check Calendar for meeting link');
                
            let successMessage = 'Meeting scheduled successfully!';
            if (meetingLink && meetingLink !== 'Check Outlook for Teams link' && meetingLink !== 'Check Calendar for meeting link') {
                successMessage += ` <a href="${meetingLink}" target="_blank">Join Meeting</a>`;
                
                // Create clipboard button for meeting link
                const tempInput = document.createElement('input');
                tempInput.value = meetingLink;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);
                
                showSuccess(successMessage);
            } else {
                showSuccess(successMessage + ' ' + meetingLink);
            }
            
            e.target.reset();
            refreshCalendar();
        } catch (error) {
            console.error('Error scheduling meeting:', error);
            showError(error.message || 'Failed to schedule meeting. Please try again.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    });

    document.getElementById('email-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        
        const to = document.getElementById('email-to').value;
        const cc = document.getElementById('email-cc')?.value || '';
        const bcc = document.getElementById('email-bcc')?.value || '';
        const subject = document.getElementById('email-subject').value;
        const body = document.getElementById('email-body').value;

        try {
            // Determine endpoint based on provider
            const endpoint = currentProvider === 'microsoft' ? 
                             '/microsoft/outlook/send' : 
                             '/gmail/send';
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('jwt')}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ to, cc, bcc, subject, body }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Failed to send email');
            }

            const result = await response.json();
            const recipientCount = result.recipientCount || {};
            let successMessage = 'Email sent successfully!';
            
            // Show additional details about recipients if available
            if (recipientCount.to > 0 || recipientCount.cc > 0 || recipientCount.bcc > 0) {
                const totalRecipients = (recipientCount.to || 0) + (recipientCount.cc || 0) + (recipientCount.bcc || 0);
                successMessage += ` Sent to ${totalRecipients} recipient${totalRecipients !== 1 ? 's' : ''}.`;
            }
            
            showSuccess(successMessage);
            e.target.reset();
        } catch (error) {
            showError('Error: ' + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    });

    document.getElementById('refresh-calendar').addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        
        refreshCalendar().finally(() => {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        });
    });

    // Update natural language meeting scheduling
    document.getElementById('natural-meeting-input').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitButton.innerHTML;
        const input = document.getElementById('meeting-natural-input').value;
        const userTimezone = localStorage.getItem('selectedTimezone') || 
                         Intl.DateTimeFormat().resolvedOptions().timeZone || 
                         'UTC';
        
        try {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            
            // Pass user's timezone and provider to the LLM service
            const processedData = await processLLMRequest(input, 'meeting', userTimezone);
            
            // Get the final timezone to use (either detected from input or user's timezone)
            const timezone = processedData.timezone || userTimezone;
            
            // Show feedback about timezone detection
            if (processedData.timezone && processedData.timezone !== userTimezone) {
                const friendlyTimezone = processedData.timezone.split('/').pop().replace('_', ' ');
                const feedbackEl = document.createElement('div');
                feedbackEl.className = 'timezone-feedback';
                feedbackEl.innerHTML = `<i class="fas fa-globe"></i> Using detected timezone: ${friendlyTimezone}`;
                e.target.appendChild(feedbackEl);
                
                // Remove feedback after 5 seconds
                setTimeout(() => {
                    feedbackEl.remove();
                }, 5000);
            }
            
            // Format event data based on provider
            let eventData;
            
            if (currentProvider === 'microsoft') {
                // Microsoft format
                eventData = {
                    summary: processedData.summary,
                    start: processedData.start,
                    end: processedData.end,
                    attendees: processedData.attendees
                };
            } else {
                // Google format with consistent dateTime format
                eventData = {
                    summary: processedData.summary,
                    attendees: processedData.attendees.map(email => ({ email }))
                };
                
                // Ensure both start and end use the same format (dateTime)
                if (processedData.start && processedData.end) {
                    eventData.start = { 
                        dateTime: processedData.start, 
                        timeZone: timezone 
                    };
                    eventData.end = { 
                        dateTime: processedData.end,
                        timeZone: timezone
                    };
                }
            }
            
            // Determine endpoint based on provider
            const endpoint = currentProvider === 'microsoft' ? 
                           '/microsoft/calendar/nl-create' : 
                           '/calendar/nl-create';
            
            console.log(`Sending meeting data to ${endpoint}:`, JSON.stringify(eventData, null, 2));
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('jwt')}`
                },
                body: JSON.stringify({ text: input, timezone: timezone })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Failed to schedule meeting');
            }

            const data = await response.json();
            // Extract meeting link if available
            const meetingLink = currentProvider === 'microsoft' ? 
                (data.onlineMeeting?.joinUrl || 'Check Outlook for Teams link') : 
                (data.hangoutLink || 'Check Calendar for meeting link');
                
            let successMessage = 'Meeting scheduled successfully!';
            if (meetingLink && meetingLink !== 'Check Outlook for Teams link' && meetingLink !== 'Check Calendar for meeting link') {
                successMessage += ` <a href="${meetingLink}" target="_blank">Join Meeting</a>`;
                
                // Create clipboard button for meeting link
                const tempInput = document.createElement('input');
                tempInput.value = meetingLink;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);
                
                showSuccess(successMessage);
            } else {
                showSuccess(successMessage + ' ' + meetingLink);
            }
            
            e.target.reset();
            refreshCalendar();
        } catch (error) {
            console.error('Error scheduling meeting:', error);
            showError(error.message || 'Failed to schedule meeting. Please try again.');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = originalBtnText;
        }
    });

    // Update natural language email sending
    document.getElementById('natural-email-input').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitButton.innerHTML;
        const input = document.getElementById('email-natural-input').value;
        
        try {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            
            const processedData = await processLLMRequest(input, 'email');
            
            // Determine endpoint based on provider
            const endpoint = currentProvider === 'microsoft' ? 
                           '/microsoft/outlook/send' : 
                           '/gmail/send';
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('jwt')}`
                },
                body: JSON.stringify(processedData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Failed to send email');
            }

            const result = await response.json();
            const recipientCount = result.recipientCount || {};
            let successMessage = 'Email sent successfully!';
            
            // Show additional details about recipients if available
            if (recipientCount.to > 0 || recipientCount.cc > 0 || recipientCount.bcc > 0) {
                const totalRecipients = (recipientCount.to || 0) + (recipientCount.cc || 0) + (recipientCount.bcc || 0);
                successMessage += ` Sent to ${totalRecipients} recipient${totalRecipients !== 1 ? 's' : ''}.`;
            }
            
            showSuccess(successMessage);
            e.target.reset();
        } catch (error) {
            console.error('Error sending email:', error);
            showError(error.message || 'Failed to send email. Please try again.');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = originalBtnText;
        }
    });

    async function showDashboard() {
        authSection.style.display = 'none';
        dashboard.style.display = 'block';
        updateProviderLabel();
        initializeTimezoneSelector();
        updateSessionTime();
        sessionTimeout = setInterval(updateSessionTime, 1000);
        await refreshCalendar();
    }

    function showAuthSection() {
        dashboard.style.display = 'none';
        authSection.style.display = 'block';
    }

    function updateSessionTime() {
        const token = localStorage.getItem('jwt');
        if (token) {
            try {
                const decoded = jwtDecode(token);
                const expiry = decoded.exp * 1000; // Convert to milliseconds
                const now = Date.now();
                const timeLeft = expiry - now;

                if (timeLeft <= 0) {
                    clearTimeout(sessionTimeout);
                    showError('Session expired. Please login again.');
                    localStorage.removeItem('jwt');
                    localStorage.removeItem('provider');
                    showAuthSection();
                } else {
                    const minutes = Math.floor(timeLeft / 60000);
                    const seconds = Math.floor((timeLeft % 60000) / 1000);
                    sessionTime.textContent = `${minutes}m ${seconds}s`;
                    
                    // Add warning class when session is almost expired
                    if (timeLeft < 300000) { // Less than 5 minutes
                        sessionTime.classList.add('session-expiring');
                    } else {
                        sessionTime.classList.remove('session-expiring');
                    }
                }
            } catch (error) {
                console.error('Error decoding token:', error);
            }
        }
    }

    async function refreshCalendar() {
        const eventList = document.getElementById('calendar-events');
        eventList.innerHTML = '<li class="loading-events"><i class="fas fa-spinner fa-spin"></i> Loading events...</li>';
        
        try {
            // Determine endpoint based on provider
            const endpoint = currentProvider === 'microsoft' ? 
                           '/microsoft/calendar/events' : 
                           '/calendar/events';
            
            const response = await fetch(endpoint, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('jwt')}` },
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch calendar events: ${response.statusText}`);
            }
            
            const events = await response.json();
            const timezone = localStorage.getItem('selectedTimezone') || 
                           Intl.DateTimeFormat().resolvedOptions().timeZone || 
                           'UTC';
            
            if (!events || events.length === 0) {
                eventList.innerHTML = '<li class="no-events"><i class="fas fa-calendar-times"></i> No upcoming events</li>';
                return;
            }
            
            eventList.innerHTML = events.map(event => {
                let startStr, endStr;
                
                try {
                    if (event.start && event.start.dateTime) {
                        startStr = window.DateTime.fromISO(event.start.dateTime)
                            .setZone(timezone)
                            .toLocaleString(window.DateTime.DATETIME_FULL);
                        
                        endStr = window.DateTime.fromISO(event.end.dateTime)
                            .setZone(timezone)
                            .toLocaleString(window.DateTime.DATETIME_FULL);
                    } else if (event.start && event.start.date) {
                        // All-day event
                        startStr = window.DateTime.fromISO(event.start.date)
                            .toLocaleString(window.DateTime.DATE_FULL);
                        
                        endStr = window.DateTime.fromISO(event.end.date)
                            .toLocaleString(window.DateTime.DATE_FULL);
                    } else {
                        // Microsoft format fallback
                        startStr = window.DateTime.fromISO(event.start || event.startTime || event.createdDateTime)
                            .setZone(timezone)
                            .toLocaleString(window.DateTime.DATETIME_FULL);
                        
                        endStr = window.DateTime.fromISO(event.end || event.endTime || event.lastModifiedDateTime)
                            .setZone(timezone)
                            .toLocaleString(window.DateTime.DATETIME_FULL);
                    }
                } catch (e) {
                    console.error('Error formatting event date:', e, event);
                    startStr = 'Invalid date';
                    endStr = 'Invalid date';
                }
                
                const title = event.summary || event.subject || 'Untitled event';
                const meetingLink = currentProvider === 'microsoft' ? 
                    (event.onlineMeeting?.joinUrl || 'Check Outlook') : 
                    (event.hangoutLink || 'Check Calendar');
                
                let meetingLinkHtml = '';
                if (meetingLink && meetingLink !== 'Check Outlook' && meetingLink !== 'Check Calendar') {
                    meetingLinkHtml = `<a href="${meetingLink}" target="_blank"><i class="fas fa-video"></i> Join Meeting</a>`;
                } else if (meetingLink) {
                    meetingLinkHtml = `<span class="check-link"><i class="fas fa-info-circle"></i> ${meetingLink}</span>`;
                }
                
                const attendees = event.attendees || [];
                const attendeeCount = attendees.length;
                let attendeeInfo = '';
                
                if (attendeeCount > 0) {
                    const firstAttendee = typeof attendees[0] === 'string' ? 
                                        attendees[0] : 
                                        (attendees[0].email || attendees[0].emailAddress?.address || 'Unknown');
                    
                    attendeeInfo = attendeeCount === 1 ? 
                                  `<div class="attendees"><i class="fas fa-user"></i> ${firstAttendee}</div>` : 
                                  `<div class="attendees"><i class="fas fa-users"></i> ${firstAttendee} + ${attendeeCount-1} more</div>`;
                }
                
                return `<li>
                    <div class="event-title">${title}</div>
                    <div class="event-time"><i class="fas fa-clock"></i> ${startStr} to ${endStr}</div>
                    ${attendeeInfo}
                    ${meetingLinkHtml}
                </li>`;
            }).join('');
            
            showSuccess('Calendar refreshed');
        } catch (error) {
            console.error('Error fetching calendar:', error);
            eventList.innerHTML = `<li class="error"><i class="fas fa-exclamation-triangle"></i> Error: ${error.message}</li>`;
            showError(`Failed to refresh calendar: ${error.message}`);
        }
    }

    function jwtDecode(token) {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    }

    // Update the LLM request processing function to use the correct endpoint path
    // Add new function for LLM processing
    async function processLLMRequest(input, type, userTimezone) {
        try {
            // Include provider in request to allow backend to format response correctly
            const response = await fetch('/llm/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('jwt')}`
                },
                body: JSON.stringify({ 
                    input, 
                    type, 
                    userTimezone,
                    provider: currentProvider 
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Failed to process request');
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error processing LLM request:', error);
            throw error;
        }
    }

    // Helper function to update timezone offset information
    function updateTimezoneOffsetInfo() {
        const timezoneSelect = document.getElementById('timezone-select');
        const selectedTimezone = timezoneSelect.value;
        
        // Calculate current offset for the selected timezone
        const now = new Date();
        const offsetMinutes = DateTime.now().setZone(selectedTimezone).offset;
        
        // Convert offset to hours and minutes
        const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
        const offsetMins = Math.abs(offsetMinutes) % 60;
        const offsetSign = offsetMinutes >= 0 ? '+' : '-';
        
        // Format as +HH:MM
        const formattedOffset = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;
        
        // Find or create the offset display element
        let offsetDisplay = document.getElementById('timezone-offset-display');
        if (!offsetDisplay) {
            offsetDisplay = document.createElement('div');
            offsetDisplay.id = 'timezone-offset-display';
            offsetDisplay.className = 'timezone-offset';
            timezoneSelect.parentNode.appendChild(offsetDisplay);
        }
        
        // Get the current time in the selected timezone
        const currentTime = DateTime.now().setZone(selectedTimezone).toFormat('hh:mm a');
        
        // Update the display
        offsetDisplay.innerHTML = `Current time: ${currentTime} (UTC${formattedOffset})`;
        
        // Store the timezone in session storage for persistence
        sessionStorage.setItem('userTimezone', selectedTimezone);
    }

    // Enhanced function to get local time with better timezone handling
    function getLocalTime(dateTimeStr, timezone) {
        try {
            // Try to parse the date in various formats
            let dt = DateTime.fromISO(dateTimeStr);
            
            // If parsing failed, try other formats
            if (!dt.isValid) {
                // Try with timezone name format
                dt = DateTime.fromFormat(dateTimeStr, "yyyy-MM-dd'T'HH:mm:ss.SSSZ");
                
                // Try simple format
                if (!dt.isValid) {
                    dt = DateTime.fromFormat(dateTimeStr, "yyyy-MM-dd'T'HH:mm:ss");
                }
            }
            
            if (!dt.isValid) {
                console.warn(`Invalid date format: ${dateTimeStr}, using current date`);
                return DateTime.now().setZone(timezone);
            }
            
            // If the date has no timezone info, set it to the specified timezone
            if (!dateTimeStr.includes('+') && !dateTimeStr.includes('Z')) {
                dt = dt.setZone(timezone);
            }
            
            return dt;
        } catch (error) {
            console.error('Error parsing date:', error);
            return DateTime.now().setZone(timezone);
        }
    }

    // Helper to format a DateTime object to a human-readable date and time
    function formatDateTime(dt) {
        return dt.toFormat('ccc, MMM d, yyyy h:mm a');
    }

    // Helper to format a DateTime object to a human-readable time only
    function formatTime(dt) {
        return dt.toFormat('h:mm a');
    }
});