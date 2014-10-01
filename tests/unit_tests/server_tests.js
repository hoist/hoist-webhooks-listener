'use strict';
require('../bootstrap.js');
var http = require('http');
var httpMocks = require('node-mocks-http');
var sinon = require('sinon');
var server = require('../../lib/server');
var expect = require('chai').expect;
var hoistModel = require('hoist-model');
var Application = hoistModel.Application;
var mongoose = hoistModel._mongoose;
var BBPromise = require('bluebird');
var EventBroker = require('broker/lib/event_broker');
var ApplicationEvent = require('broker/lib/event_types/application_event');

describe('server', function () {
  describe('#start', function () {
    var stubbedServer = {
      listen: sinon.stub()
    };
    before(function () {
      sinon.stub(http, 'createServer').returns(stubbedServer);
      sinon.stub(mongoose, 'connect').callsArg(1);
      server.start();
    });
    after(function () {
      http.createServer.restore();
    });
    it('creates a server', function () {
      expect(http.createServer)
        .to.have.been.calledWith(server.processRequest);
    });
    it('listens to a port', function () {
      expect(stubbedServer.listen)
        .to.have.been.calledWith(8080);
    });
    it('opens up a mongoose connection', function () {
      expect(mongoose.connect)
        .to.have.been.calledWith('mongodb://localhost/hoist-test');
    });
  });
  describe('#processRequest', function () {
    describe('if endpoint exists', function () {
      var response;
      before(function () {
        var request = httpMocks.createRequest({
          headers: {
            host: 'something.incomming.hoi.io'
          },
          url: '/invoice/new',
          method: 'POST',
          body: 'some text'
        });
        response = httpMocks.createResponse({});
        sinon.stub(Application, 'findAsync', function () {
          return BBPromise.resolve([new Application({
            _id: 'applicationId',
            settings: {
              live: {
                endpoints: {
                  '/invoice/:method': {
                    methods: ['POST'],
                    event: 'post.invoice',
                    authenticate: true
                  }
                }
              }
            }
          })]);
        });
        sinon.stub(EventBroker, 'publish').callsArg(1);
        server.processRequest(request, response);
      });
      after(function () {
        EventBroker.publish.restore();
        Application.findAsync.restore();
      });
      it('looks-up app based on host', function () {
        expect(Application.findAsync)
          .to.have.been.calledWith({
            subDomain: 'something'
          });
      });
      it('publishes application event', function () {
        expect(EventBroker.publish)
          .to.have.been.calledWith(sinon.match.instanceOf(ApplicationEvent));
      });
      it('publish the correct event', function () {

        expect(EventBroker.publish.firstCall.args[0])
          .to.eql(new ApplicationEvent({
            applicationId: 'applicationId',
            eventName: 'post.invoice',
            environment: 'live',
            correlationId: response.header('CID'),
            body: {
              request: {
                headers: {
                  host: 'something.incomming.hoi.io'
                },
                url: '/invoice/new',
                method: 'POST',
                body: 'some text'
              },
              params: {
                authenticate: true,
                event: 'post.invoice',
                method: 'new'
              }
            }
          }));
      });
      it('sends a 200 response', function () {
        expect(response.statusCode).to.eql(200);
      });
      it('replies with the CID', function () {
        /*jshint -W030*/
        expect(response.header('CID')).to.exist;
      });
    });
    describe('with no matching endpoint', function () {
      var response;
      before(function () {
        var request = httpMocks.createRequest({
          headers: {
            host: 'something.incomming.hoi.io'
          },
          url: '/something/else',
          method: 'POST',
          body: 'some text'
        });
        response = httpMocks.createResponse({});
        sinon.stub(Application, 'findAsync', function () {
          return BBPromise.resolve([new Application({
            _id: 'applicationId',
            settings: {
              live: {
                endpoints: {
                  '/invoice/:method': {
                    methods: ['POST'],
                    event: 'post.invoice',
                    authenticate: true
                  }
                }
              }
            }
          })]);
        });
        sinon.stub(EventBroker, 'publish').callsArg(1);
        server.processRequest(request, response);
      });
      after(function () {
        EventBroker.publish.restore();
        Application.findAsync.restore();
      });
      it('looks-up app based on host', function () {
        expect(Application.findAsync)
          .to.have.been.calledWith({
            subDomain: 'something'
          });
      });
      it('doesn\'t publish application event', function () {
        /*jshint -W030*/
        expect(EventBroker.publish)
          .to.have.not.been.called;
      });
      it('sends a 404 response', function () {
        expect(parseInt(response.statusCode)).to.eql(404);
      });
      it('should publish a message', function () {
        expect(response._getData()).to.eql('No Endpoint Found');
      });
    });
    describe('with no matching application', function () {
      var response;
      before(function () {
        var request = httpMocks.createRequest({
          headers: {
            host: 'something.incomming.hoi.io'
          },
          url: '/something/else',
          method: 'POST',
          body: 'some text'
        });
        response = httpMocks.createResponse({});
        sinon.stub(Application, 'findAsync', function () {
          return BBPromise.resolve([]);
        });
        sinon.stub(EventBroker, 'publish').callsArg(1);
        server.processRequest(request, response);
      });
      after(function () {
        EventBroker.publish.restore();
        Application.findAsync.restore();
      });
      it('looks-up app based on host', function () {
        expect(Application.findAsync)
          .to.have.been.calledWith({
            subDomain: 'something'
          });
      });
      it('doesn\'t publish application event', function () {
        /*jshint -W030*/
        expect(EventBroker.publish)
          .to.have.not.been.called;
      });
      it('sends a 404 response', function () {
        expect(parseInt(response.statusCode)).to.eql(404);
      });
      it('should publish a message', function () {
        expect(response._getData()).to.eql('The specified application could not be found');
      });
    });
  });
});
