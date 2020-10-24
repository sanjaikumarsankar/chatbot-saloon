'use strict';

const dialogflow = require('dialogflow');
const axios = require('axios');
const config = require('./config');
const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();
const uuid = require('uuid');
var moment = require('moment');
const saloonId = '9f72b997-0d9a-4090-b84b-0eab85ddd486';
let treatmentID;
let treamentName;
let barberID;
let barberName;
let timeSLOT;
// https://www.barberbooking.com/kapper/den-haag/hair-topic/

// Messenger API parameters
if (!config.FB_PAGE_TOKEN) {
    throw new Error('missing FB_PAGE_TOKEN');
}
if (!config.FB_VERIFY_TOKEN) {
    throw new Error('missing FB_VERIFY_TOKEN');
}
if (!config.GOOGLE_PROJECT_ID) {
    throw new Error('missing GOOGLE_PROJECT_ID');
}
if (!config.DF_LANGUAGE_CODE) {
    throw new Error('missing DF_LANGUAGE_CODE');
}
if (!config.GOOGLE_CLIENT_EMAIL) {
    throw new Error('missing GOOGLE_CLIENT_EMAIL');
}
if (!config.GOOGLE_PRIVATE_KEY) {
    throw new Error('missing GOOGLE_PRIVATE_KEY');
}
if (!config.FB_APP_SECRET) {
    throw new Error('missing FB_APP_SECRET');
}
if (!config.SERVER_URL) { //used for ink to static files
    throw new Error('missing SERVER_URL');
}
if (!config.SENGRID_API_KEY) { //sending email
    throw new Error('missing SENGRID_API_KEY');
}
if (!config.EMAIL_FROM) { //sending email
    throw new Error('missing EMAIL_FROM');
}
if (!config.EMAIL_TO) { //sending email
    throw new Error('missing EMAIL_TO');
}



app.set('port', (process.env.PORT || 5000))

//verify request came from facebook
app.use(bodyParser.json({
    verify: verifyRequestSignature
}));

//serve static files in the public directory
app.use(express.static('public'));

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
    extended: false
}));

// Process application/json
app.use(bodyParser.json());






const credentials = {
    client_email: config.GOOGLE_CLIENT_EMAIL,
    private_key: config.GOOGLE_PRIVATE_KEY,
};

const sessionClient = new dialogflow.SessionsClient(
    {
        projectId: config.GOOGLE_PROJECT_ID,
        credentials
    }
);


const sessionIds = new Map();

// Index route
app.get('/', function (req, res) {
    res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
    console.log("request");
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.FB_VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
})

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook/', function (req, res) {
    var data = req.body;
    // Make sure this is a page subscription
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function (pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;

            // Iterate over each messaging event
            pageEntry.messaging.forEach(function (messagingEvent) {
                if (messagingEvent.optin) {
                    console.log('receivedAuthentication');
                    receivedAuthentication(messagingEvent);
                } else if (messagingEvent.message) {
                    console.log('receivedMessage');
                    receivedMessage(messagingEvent);
                } else if (messagingEvent.delivery) {
                    console.log('receivedDeliveryConfirmation');
                    receivedDeliveryConfirmation(messagingEvent);
                } else if (messagingEvent.postback) {
                    console.log('receivedPostback');
                    receivedPostback(messagingEvent);
                } else if (messagingEvent.read) {
                    console.log('receivedMessageRead');
                    receivedMessageRead(messagingEvent);
                } else if (messagingEvent.account_linking) {
                    console.log('receivedAccountLink');
                    receivedAccountLink(messagingEvent);
                } else {
                    console.log("Webhook received unknown messagingEvent: ", messagingEvent);
                }
            });
        });

        // Assume all went well.
        // You must send back a 200, within 20 seconds
        res.sendStatus(200);
    }
});





function receivedMessage(event) {

    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    if (!sessionIds.has(senderID)) {
        sessionIds.set(senderID, uuid.v1());
    }
    //console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
    //console.log(JSON.stringify(message));

    var isEcho = message.is_echo;
    var messageId = message.mid;
    var appId = message.app_id;
    var metadata = message.metadata;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;
    var quickReply = message.quick_reply;

    if (isEcho) {
        handleEcho(messageId, appId, metadata);
        return;
    } else if (quickReply) {
        handleQuickReply(senderID, quickReply, messageId);
        return;
    }


    if (messageText) {
        //send message to api.ai
        sendToDialogFlow(senderID, messageText);
    } else if (messageAttachments) {
        handleMessageAttachments(messageAttachments, senderID);
    }
}


function handleMessageAttachments(messageAttachments, senderID) {
    //for now just reply
    sendTextMessage(senderID, "Attachment received. Thank you.");
}

function handleQuickReply(senderID, quickReply, messageId) {
    var quickReplyPayload = quickReply.payload;
    console.log("Quick reply for message %s with payload %s", messageId, quickReplyPayload);
    //send payload to api.ai
    sendToDialogFlow(senderID, quickReplyPayload);
}

//https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-echo
function handleEcho(messageId, appId, metadata) {
    // Just logging message echoes to console
    console.log("Received echo for message %s and app %d with metadata %s", messageId, appId, metadata);
}

function handleDialogFlowAction(sender, action, messages, contexts, parameters) {
    console.log("***********action****************", action);
    switch (action) {
        case "input.welcome":

            console.log("welcome intent called********************");

            handleMessages(messages, sender);

            getStarted(sender);

            break;

        case "detailed-application":
            let filteredContexts = contexts.filter(function (el) {
                return el.name.includes('job_application') ||
                    el.name.includes('job-application-details_dialog_context')
            });
            if (filteredContexts.length > 0 && contexts[0].parameters) {
                let phone_number = (isDefined(contexts[0].parameters.fields['phone-number'])
                    && contexts[0].parameters.fields['phone-number'] != '') ? contexts[0].parameters.fields['phone-number'].stringValue : '';
                let user_name = (isDefined(contexts[0].parameters.fields['user-name'])
                    && contexts[0].parameters.fields['user-name'] != '') ? contexts[0].parameters.fields['user-name'].stringValue : '';
                let previous_job = (isDefined(contexts[0].parameters.fields['previous-job'])
                    && contexts[0].parameters.fields['previous-job'] != '') ? contexts[0].parameters.fields['previous-job'].stringValue : '';
                let years_of_experience = (isDefined(contexts[0].parameters.fields['years-of-experience'])
                    && contexts[0].parameters.fields['years-of-experience'] != '') ? contexts[0].parameters.fields['years-of-experience'].stringValue : '';
                let job_vacancy = (isDefined(contexts[0].parameters.fields['job-vacancy'])
                    && contexts[0].parameters.fields['job-vacancy'] != '') ? contexts[0].parameters.fields['job-vacancy'].stringValue : '';
                if (phone_number != '' && user_name != '' && previous_job != '' && years_of_experience != ''
                    && job_vacancy != '') {

                    let emailContent = 'A new job enquiery from ' + user_name + ' for the job: ' + job_vacancy +
                        '.<br> Previous job position: ' + previous_job + '.' +
                        '.<br> Years of experience: ' + years_of_experience + '.' +
                        '.<br> Phone number: ' + phone_number + '.';

                    sendEmail('New job application', emailContent);

                    handleMessages(messages, sender);
                } else {
                    handleMessages(messages, sender);
                }
            }
            break;

        default:
            //unhandled action, just send back the text
            handleMessages(messages, sender);
    }
}

function getStarted(sender) {
    sendTypingOff(sender);

    let buttons = [{
        type: "postback",
        title: "Talk to admin",
        payload: "ADMIN"

    }, {
        type: "postback",
        title: "Book a Barber",
        payload: "BARBER"

    }];

    sendButtonMessage(sender, "Please tap 'Book a barber' button to start the booking process Or tap 'Book a admin'", buttons);

}


function handleMessage(message, sender) {
    switch (message.message) {
        case "text": //text
            message.text.text.forEach((text) => {
                if (text !== '') {
                    sendTextMessage(sender, text);
                }
            });
            break;
        case "quickReplies": //quick replies
            let replies = [];
            message.quickReplies.quickReplies.forEach((text) => {
                let reply =
                    {
                        "content_type": "text",
                        "title": text,
                        "payload": text
                    }
                replies.push(reply);
            });
            sendQuickReply(sender, message.quickReplies.title, replies);
            break;
        case "image": //image
            sendImageMessage(sender, message.image.imageUri);
            break;
    }
}


function handleCardMessages(messages, sender) {

    let elements = [];
    for (var m = 0; m < messages.length; m++) {
        let message = messages[m];
        let buttons = [];
        for (var b = 0; b < message.card.buttons.length; b++) {
            let isLink = (message.card.buttons[b].postback.substring(0, 4) === 'http');
            let button;
            if (isLink) {
                button = {
                    "type": "web_url",
                    "title": message.card.buttons[b].text,
                    "url": message.card.buttons[b].postback
                }
            } else {
                button = {
                    "type": "postback",
                    "title": message.card.buttons[b].text,
                    "payload": message.card.buttons[b].postback
                }
            }
            buttons.push(button);
        }


        let element = {
            "title": message.card.title,
            "image_url": message.card.imageUri,
            "subtitle": message.card.subtitle,
            "buttons": buttons
        };
        elements.push(element);
    }
    sendGenericMessage(sender, elements);
}


function handleMessages(messages, sender) {
    let timeoutInterval = 1100;
    let previousType;
    let cardTypes = [];
    let timeout = 0;
    for (var i = 0; i < messages.length; i++) {

        if (previousType == "card" && (messages[i].message != "card" || i == messages.length - 1)) {
            timeout = (i - 1) * timeoutInterval;
            setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
            cardTypes = [];
            timeout = i * timeoutInterval;
            setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
        } else if (messages[i].message == "card" && i == messages.length - 1) {
            cardTypes.push(messages[i]);
            timeout = (i - 1) * timeoutInterval;
            setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
            cardTypes = [];
        } else if (messages[i].message == "card") {
            cardTypes.push(messages[i]);
        } else {

            timeout = i * timeoutInterval;
            setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
        }

        previousType = messages[i].message;

    }
}

function handleDialogFlowResponse(sender, response) {
    console.log('handleDialogFlowResponse');
    let responseText = response.fulfillmentMessages.fulfillmentText;

    let messages = response.fulfillmentMessages;
    let action = response.action;
    let contexts = response.outputContexts;
    let parameters = response.parameters;

    sendTypingOff(sender);

    if (isDefined(action)) {
        handleDialogFlowAction(sender, action, messages, contexts, parameters);
    } else if (isDefined(messages)) {
        handleMessages(messages, sender);
    } else if (responseText == '' && !isDefined(action)) {
        //dialogflow could not evaluate input.
        console.log('**********************handleDialogFlowResponse****************************');
        sendTextMessage(sender, "I'm not sure what you want. Can you be more specific?");
    } else if (isDefined(responseText)) {
        sendTextMessage(sender, responseText);
    }
}

async function sendToDialogFlow(sender, textString, params) {
    console.log('****sendtodialogflow****');
    sendTypingOn(sender);

    try {
        const sessionPath = sessionClient.sessionPath(
            config.GOOGLE_PROJECT_ID,
            sessionIds.get(sender)
        );

        const request = {
            session: sessionPath,
            queryInput: {
                text: {
                    text: textString,
                    languageCode: config.DF_LANGUAGE_CODE,
                },
            },
            queryParams: {
                payload: {
                    data: params
                }
            }
        };
        const responses = await sessionClient.detectIntent(request);

        const result = responses[0].queryResult;
        handleDialogFlowResponse(sender, result);
    } catch (e) {
        console.log('error');
        console.log(e);
    }

}




function sendTextMessage(recipientId, text) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text
        }
    }
    callSendAPI(messageData);
}

/*
 * Send an image using the Send API.
 *
 */
function sendImageMessage(recipientId, imageUrl) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: imageUrl
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: config.SERVER_URL + "/assets/instagram_logo.gif"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "audio",
                payload: {
                    url: config.SERVER_URL + "/assets/sample.mp3"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example videoName: "/assets/allofus480.mov"
 */
function sendVideoMessage(recipientId, videoName) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "video",
                payload: {
                    url: config.SERVER_URL + videoName
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example fileName: fileName"/assets/test.txt"
 */
function sendFileMessage(recipientId, fileName) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "file",
                payload: {
                    url: config.SERVER_URL + fileName
                }
            }
        }
    };

    callSendAPI(messageData);
}



/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId, text, buttons) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: text,
                    buttons: buttons
                }
            }
        }
    };

    callSendAPI(messageData);
}


function sendGenericMessage(recipientId, elements) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: elements
                }
            }
        }
    };

    callSendAPI(messageData);
}

function sendReceiptMessage(recipientId, recipient_name, currency, payment_method,
    timestamp, elements, address, summary, adjustments) {
    // Generate a random receipt ID as the API requires a unique ID
    var receiptId = "order" + Math.floor(Math.random() * 1000);

    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "receipt",
                    recipient_name: recipient_name,
                    order_number: receiptId,
                    currency: currency,
                    payment_method: payment_method,
                    timestamp: timestamp,
                    elements: elements,
                    address: address,
                    summary: summary,
                    adjustments: adjustments
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId, text, replies, metadata) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text,
            metadata: isDefined(metadata) ? metadata : '',
            quick_replies: replies
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "mark_seen"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {


    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_on"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {


    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_off"
    };

    callSendAPI(messageData);
}

function greetUserText(userId) {
    //first read user firstname
    request({
        uri: 'https://graph.facebook.com/v3.2/' + userId,
        qs: {
            access_token: config.FB_PAGE_TOKEN
        }

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log(body);
            console.log(JSON.parse(body));

            var user = JSON.parse(body);
            console.log('getUserData: ' + user);
            if (user.first_name) {
                console.log("FB user: %s %s, %s",
                    user.first_name, user.last_name, user.profile_pic);
                var message = `Welcome ${user.first_name}. Please tap 'Book a barber' button to start the booking process Or tap 'Book a admin`
                // sendTextMessage(userId, message);


                var buttons = [{
                    type: "postback",
                    title: "Talk to admin",
                    payload: "ADMIN"

                }, {
                    type: "postback",
                    title: "Book a Barber",
                    payload: "BARBER"

                }];

                sendButtonMessage(userId, message, buttons);
            } else {
                console.log("Cannot get data for fb user with id",
                    userId);
            }
        } else {
            console.error(response.error);
        }

    });
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "Welcome. Link your account.",
                    buttons: [{
                        type: "account_link",
                        url: config.SERVER_URL + "/authorize"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */
function callSendAPI(messageData) {
    console.log('****callSendAPI****');
    console.log(messageData);
    request({
        uri: 'https://graph.facebook.com/v3.2/me/messages',
        qs: {
            access_token: config.FB_PAGE_TOKEN
        },
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;
            console.log('***body response below: ');
            console.log(body);

            if (messageId) {
                console.log("Successfully sent message with id %s to recipient %s",
                    messageId, recipientId);
            } else {
                console.log("Successfully called Send API for recipient %s",
                    recipientId);
            }
        } else {
            console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
        }
    });
}



/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    var payload = event.postback.payload;
    var payloadDuplicate = payload;
    console.log('************************events**************************');
    if (payload.includes('TREATMENTS')) {
        payload = 'TREATMENTS'
    } else if (payload.includes('DATESLOT')) {
        payload = 'DATESLOT'
    } else if (payload.includes('TIMESLOT')) {
        payload = 'TIMESLOT'
    } else if (payload.includes('PERSON')) {
        payload = 'PERSON'
    }
    console.log(payload);

    switch (payload) {
        case 'GET_STARTED':
            greetUserText(senderID);
            break;
        case 'ADMIN':
            sendTextMessage(senderID, "Admin is in progress. Please select barber to proceed further.");
            break;
        case 'BARBER':
            console.log('*************************You selected barber***********************************')
            bookBarber(senderID);
            break;
        case 'TREATMENTS':
            // sendTextMessage(senderID, "You selected treatments");
            treamentName = payloadDuplicate.split('_')[2];
            availbleBarber(senderID, payloadDuplicate.split('_')[1]);
            break;
        case 'DATESLOT':
            barberName = payloadDuplicate.split('_')[2];
            availableDateSlot(senderID, payloadDuplicate.split('_')[1])
            break;
        case 'TIMESLOT':
            availableTimeSlot(senderID, payloadDuplicate.split('_')[1])
            break;
        case 'PERSON':
            sendTextMessage(senderID, `You choose a ${treamentName} treatment`);
            sendTextMessage(senderID, `In our salon, you will be treated by one of our best barber, ${barberName}`);
            sendTextMessage(senderID, `Please save the date, you reserved will be at ${moment(new Date(timeSLOT)).format('DD-MM-YYYY')}, ${payloadDuplicate.split('_')[1]}`);
            sendButtonMessage(senderID, `Please tap 'CONFIRM' button to confirm your booking`, [{
                type: "postback",
                title: "CONFIRM",
                payload: "CONFIRM"
            }]
            );
            break;
        case 'CONFIRM':
            sendTextMessage(senderID, "Your reservation confirmed. Thanks for booking with us!");
            break;
        default:
            //unindentified payload
            console.log('**********************DEFAULT****************************');
            sendTextMessage(senderID, "I'm not sure what you want. Can you be more specific?");
            break;

    }

    console.log("Received postback for user %d and page %d with payload '%s' " +
        "at %d", senderID, recipientID, payload, timeOfPostback);

}

function bookBarber(senderID) {

    axios.get(`https://www.barberbooking.com/api/availabletreatments/?salonId=${saloonId}`)
        .then(function (response) {
            availableTreatment(response, senderID);
        })
        .catch(function (error) {
            sendTextMessage(senderID, "Oops.. Something wrong. Please try again later");
            console.log(error);
        });
}


function availableTreatment(response, senderID) {
    console.log("*******************availableTreatment called********************************");
    if (response && response.data && response.data.length) {
        for (var i = 0; i < response.data.length; i++) {
            sendGenericMessage(senderID, [{
                title: response.data[i].Name,
                subtitle: `${response.data[i].Price} euro`,
                buttons: [{
                    type: "postback",
                    title: 'Select Treatment',
                    payload: `TREATMENTS_${response.data[i].Id}_${response.data[i].Name}`
                }]
            }]);
        }
    } else {
        sendTextMessage(senderID, "Sorry. No treatment avaialble");
    }
}

function availbleBarber(senderID, treatmentId) {
    console.log('***********treatmentId***************');
    console.log(treatmentId);
    treatmentID = treatmentId;
    axios.post(`https://www.barberbooking.com/api/availablebarbers/?salonId=${saloonId}`,
        {
            isNewCustomer: "true",
            treatmentId: treatmentId
        })
        .then(function (response) {
            showAvailbleBarbers(response, senderID);
        })
        .catch(function (error) {
            sendTextMessage(senderID, "Oops.. Something wrong. Please try again later");
            console.log(error);
        });
}

function showAvailbleBarbers(response, senderID) {
    if (response && response.data && response.data.length) {
        for (var i = 0; i < response.data.length; i++) {
            sendGenericMessage(senderID, [{
                title: response.data[i].DisplayName,
                buttons: [{
                    type: "postback",
                    title: 'Select Barber',
                    payload: `DATESLOT_${response.data[i].Id}_${response.data[i].DisplayName}`
                }]
            }]);
        }
        console.log('****************AVAILABLE BARBERS BELOW************');
        console.log(response);
    } else {
        sendTextMessage(senderID, "Oops. No barber available");
    }
    // payload: `BARBERNAME_${response.data[i].Id}`
}

function availableDateSlot(senderID, barberId) {
    barberID = barberId;

    axios.post(`https://www.barberbooking.com/api/availabledates/?salonId=${saloonId}`,
        {
            isNewCustomer: "true",
            treatmentId: treatmentID,
            barberId: barberId
        })
        .then(function (response) {
            console.log(response);
            showAvailableDates(senderID, response);
        })
        .catch(function (error) {
            sendTextMessage(senderID, "Oops.. Something wrong in date slot. Please try again later");
            console.log(error);
        });
}

function showAvailableDates(senderID, response) {
    if (response && response.data && response.data.length) {
        for (var i = 0; i < response.data.length; i++) {
            // title: response.data[i],
            sendGenericMessage(senderID, [{
                title: moment(new Date(response.data[i])).format('DD-MM-YYYY'),
                buttons: [{
                    type: "postback",
                    title: 'Select Date',
                    payload: `TIMESLOT_${response.data[i]}`
                }]
            }]);
        }
    } else {
        sendTextMessage(senderID, "Oops! No slot avilable");
    }
}

function availableTimeSlot(senderID, time) {
    console.log('***************************TIME************************');
    console.log(time);
    timeSLOT = time;
    var todayDate = new Date().toISOString().slice(0, 10);

    var afterSevenDay = new Date();
    afterSevenDay.setDate(afterSevenDay.getDate() + 7);
    afterSevenDay = afterSevenDay.toISOString().slice(0, 10);
    console.log('*****************printing date*******************');
    console.log(todayDate);
    console.log(afterSevenDay);

    axios.post(`https://www.barberbooking.com/api/appointmentslots/findslots/?salonId=${saloonId}`,
        {
            isNewCustomer: "true",
            treatmentId: treatmentID,
            barberId: barberID,
            startDate: moment(new Date(timeSLOT)).format('YYYY-MM-DD'),
            time: null,
            endDate: moment(new Date(timeSLOT)).format('YYYY-MM-DD')
        })
        .then(function (response) {
            console.log(response);
            showAvailableTimeSlot(senderID, response);
        })
        .catch(function (error) {
            sendTextMessage(senderID, "Oops.. Something wrong in time slot. Please try again later");
            console.log(error);
        });
    // https://www.barberbooking.com/api/appointmentslots/findslots/?salonId=9f72b997-0d9a-4090-b84b-0eab85ddd486
}

function showAvailableTimeSlot(senderID, response) {
    console.log('************************Response of timeslot********************');
    console.log(response);

    if (response && response.data && response.data.length) {
        for (var i = 0; i < response.data.length; i++) {
            console.log('******************************moment dd/mm/yyyy date format below*******************************');
            console.log(moment(response.data[i].StartDate).format('HH:mm')); // HH:mm:ss
            sendGenericMessage(senderID, [{
                title: moment(response.data[i].StartDate).format('HH:mm'),
                buttons: [{
                    type: "postback",
                    title: 'Select Timeslot',
                    payload: `PERSON_${moment(response.data[i].StartDate).format('HH:mm')}`
                }]
            }]);
        }
    } else {
        sendTextMessage(senderID, "Oops.. No time slot available!");
    }
}


/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 * 
 */
function receivedMessageRead(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    // All messages before watermark (a timestamp) or sequence have been seen.
    var watermark = event.read.watermark;
    var sequenceNumber = event.read.seq;

    console.log("Received message read event for watermark %d and sequence " +
        "number %d", watermark, sequenceNumber);
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 * 
 */
function receivedAccountLink(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    var status = event.account_linking.status;
    var authCode = event.account_linking.authorization_code;

    console.log("Received account link event with for user %d with status %s " +
        "and auth code %s ", senderID, status, authCode);
}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var delivery = event.delivery;
    var messageIDs = delivery.mids;
    var watermark = delivery.watermark;
    var sequenceNumber = delivery.seq;

    if (messageIDs) {
        messageIDs.forEach(function (messageID) {
            console.log("Received delivery confirmation for message ID: %s",
                messageID);
        });
    }

    console.log("All message before %d were delivered.", watermark);
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to 
 * Messenger" plugin, it is the 'data-ref' field. Read more at 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfAuth = event.timestamp;

    // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
    // The developer can set this to an arbitrary value to associate the
    // authentication callback with the 'Send to Messenger' click event. This is
    // a way to do account linking when the user clicks the 'Send to Messenger'
    // plugin.
    var passThroughParam = event.optin.ref;

    console.log("Received authentication for user %d and page %d with pass " +
        "through param '%s' at %d", senderID, recipientID, passThroughParam,
        timeOfAuth);

    // When an authentication is received, we'll send a message back to the sender
    // to let them know it was successful.
    sendTextMessage(senderID, "Authentication successful");
}

/*
 * Verify that the callback came from Facebook. Using the App Secret from 
 * the App Dashboard, we can verify the signature that is sent with each 
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
    var signature = req.headers["x-hub-signature"];

    if (!signature) {
        throw new Error('Couldn\'t validate the signature.');
    } else {
        var elements = signature.split('=');
        var method = elements[0];
        var signatureHash = elements[1];

        var expectedHash = crypto.createHmac('sha1', config.FB_APP_SECRET)
            .update(buf)
            .digest('hex');

        if (signatureHash != expectedHash) {
            throw new Error("Couldn't validate the request signature.");
        }
    }
}

function sendEmail(subject, content) {
    console.log('sending email!');
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(config.SENGRID_API_KEY);
    const msg = {
        to: config.EMAIL_TO,
        from: config.EMAIL_FROM,
        subject: subject,
        text: content,
        html: content,
    };
    sgMail.send(msg)
        .then(() => {
            console.log('Email Sent!');
        })
        .catch(error => {
            console.log('Email NOT Sent!');
            console.error(error.toString());
        });

}

function isDefined(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    if (!obj) {
        return false;
    }

    return obj != null;
}

// Spin up the server
app.listen(app.get('port'), function () {
    console.log('running on port', app.get('port'))
})
